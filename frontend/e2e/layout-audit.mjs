import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');

// Load audit-specific env first, then fallback to regular frontend env.
loadEnv({ path: path.join(FRONTEND_DIR, '.env.layout-audit') });
loadEnv({ path: path.join(FRONTEND_DIR, '.env') });

const BASE_URL = process.env.LAYOUT_AUDIT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';
const LOCALE = process.env.LAYOUT_AUDIT_LOCALE || 'en';
const TARGET_PATH = process.env.LAYOUT_AUDIT_PATH || `/${LOCALE}/app`;
const OUT_DIR =
  process.env.LAYOUT_AUDIT_OUT_DIR || path.resolve(process.cwd(), '../private/layout-audit');
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'layout@test.local';
const LOGIN_EMAIL = process.env.LAYOUT_AUDIT_EMAIL || '';
const ALLOW_REGISTER = process.env.LAYOUT_AUDIT_ALLOW_REGISTER === '1';
const SKIP_AUTH = process.env.LAYOUT_AUDIT_SKIP_AUTH === '1';
/** Comma-separated paths: `app,account` → /en/app, /en/account; or full `/fr/app/login`. */
const PATHS_RAW = process.env.LAYOUT_AUDIT_PATHS || '';
/** Deck UUID (or id) — appends `/app/decks/{id}` and optionally `/study` (see below). */
const DECK_ID_RAW = (process.env.LAYOUT_AUDIT_DECK_ID || '').trim();
const INCLUDE_STUDY = process.env.LAYOUT_AUDIT_INCLUDE_STUDY === '1';
/** Optional query for study URL only, e.g. `atRiskOnly=true` (no leading `?` required). */
const STUDY_QUERY_RAW = (process.env.LAYOUT_AUDIT_STUDY_QUERY || '').trim();
/** Minimum tap target (CSS px) for interactive nodes in main/sidebar (WCAG 2.5.5 suggests 44×44; we warn below this). */
const MIN_TOUCH_PX = Number.parseInt(process.env.LAYOUT_AUDIT_MIN_TOUCH_PX || '44', 10) || 44;
const FAIL_ON_HORIZONTAL_OVERFLOW = process.env.LAYOUT_AUDIT_FAIL_ON_HORIZONTAL_OVERFLOW === '1';
const FAIL_ON_MOBILE_OVERFLOW_ONLY = process.env.LAYOUT_AUDIT_FAIL_ON_MOBILE_OVERFLOW_ONLY === '1';
const MAX_SMALL_TAPS_RAW = (process.env.LAYOUT_AUDIT_MAX_SMALL_TAPS || '').trim();
const MAX_OVERLAPS_RAW = (process.env.LAYOUT_AUDIT_MAX_OVERLAPS || '').trim();
const KEYBOARD_SMOKE = process.env.LAYOUT_AUDIT_KEYBOARD_SMOKE === '1';
const KEYBOARD_TAB_STEPS = Number.parseInt(process.env.LAYOUT_AUDIT_KEYBOARD_TAB_STEPS || '8', 10) || 8;

const STATES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, openMenu: false },
  { name: 'mobile-menu-closed', viewport: { width: 390, height: 844 }, openMenu: false },
  { name: 'mobile-menu-open', viewport: { width: 390, height: 844 }, openMenu: true },
];

const TARGETS = [
  { name: 'sidebar', selector: 'aside', all: false },
  { name: 'header', selector: 'header', all: false },
  { name: 'main', selector: 'main', all: false },
  { name: 'menuToggle', selector: 'button[aria-label="Open menu"], button[aria-label="Close menu"]', all: false },
  { name: 'navLinks', selector: 'aside nav a', all: true },
  { name: 'signOutButtons', selector: 'aside button', all: true },
  { name: 'contentCards', selector: 'main .mc-study-surface, main .mc-study-card-front, main .mc-study-card-back', all: true },
  { name: 'contentButtons', selector: 'main button, main a', all: true },
];

function parseEmailParts(email) {
  const [name, domain] = email.split('@');
  if (!name || !domain) {
    return { name: 'layout', domain: 'test.local' };
  }
  return { name, domain };
}

function uniqueEmail(seedBase) {
  const seed = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const { name, domain } = parseEmailParts(seedBase);
  return `${name}+${seed}@${domain}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeDeckId(raw) {
  const id = (raw || '').trim();
  if (!id) return '';
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error(
      `LAYOUT_AUDIT_DECK_ID must contain only letters, digits, and hyphens (got ${JSON.stringify(raw)})`
    );
  }
  return id;
}

function normalizeStudyQuery(q) {
  if (!q) return '';
  return q.startsWith('?') ? q : `?${q}`;
}

/** Normalize env path segments into full pathname (must start with /). May include `?query`. */
function expandAuditPaths() {
  let paths;
  if (!PATHS_RAW.trim()) {
    paths = [TARGET_PATH.startsWith('/') ? TARGET_PATH : `/${LOCALE}/${TARGET_PATH}`];
  } else {
    paths = PATHS_RAW.split(',').map((s) => {
      const t = s.trim();
      if (!t) return `/${LOCALE}/app`;
      if (t.startsWith('/')) return t;
      return `/${LOCALE}/${t.replace(/^\//, '')}`;
    });
  }

  const deckId = sanitizeDeckId(DECK_ID_RAW);
  const pushUnique = (p) => {
    if (p && !paths.includes(p)) paths.push(p);
  };

  if (deckId) {
    pushUnique(`/${LOCALE}/app/decks/${deckId}`);
    if (INCLUDE_STUDY) {
      pushUnique(`/${LOCALE}/app/decks/${deckId}/study${normalizeStudyQuery(STUDY_QUERY_RAW)}`);
    }
  }

  return paths;
}

/** Filesystem-safe slug; preserves distinct URLs when only the query differs. */
function pathToSlug(p) {
  const [pathname, query] = p.split('?');
  const base = pathname.replace(/^\//, '').replace(/\//g, '__') || 'root';
  if (!query) return base;
  const qslug = query.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return qslug ? `${base}__q_${qslug}` : base;
}

/** Pathname only (e2eRoute has no search string). */
function readinessPath(auditPath) {
  return auditPath.split('?')[0];
}

/** App routes that use AppLayoutShell + e2e readiness probes. */
function routeUsesAppShell(pathname) {
  const seg = pathname.split('/').filter(Boolean);
  if (seg.length < 2) return false;
  // /{locale}/app/...
  return seg[1] === 'app';
}

async function waitForPublicPageReady(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('main', { timeout: 15000 });
}

async function waitForAppReady(page, expectedPath) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('main');
  try {
    await page.waitForFunction(
      () => {
        const root = document.documentElement;
        return root.dataset.e2eShellReady === '1' || window.location.pathname.includes('/login');
      },
      undefined,
      { timeout: 15000 }
    );
  } catch (error) {
    const details = await page.evaluate(() => ({
      url: window.location.href,
      pathname: window.location.pathname,
      e2eShellReady: document.documentElement.dataset.e2eShellReady || null,
      e2eRoute: document.documentElement.dataset.e2eRoute || null,
      e2eLocale: document.documentElement.dataset.e2eLocale || null,
    }));
    throw new Error(
      `App shell readiness marker missing: ${JSON.stringify(details)}; original=${String(error)}`
    );
  }

  if ((await page.url()).includes('/login')) {
    throw new Error(`Not authenticated for protected route; landed on login: ${await page.url()}`);
  }

  try {
    await page.waitForFunction(
      ({ targetPath }) => {
        const root = document.documentElement;
        const route = root.dataset.e2eRoute || '';
        const locale = root.dataset.e2eLocale || '';
        const probeSize = document.getElementById('e2e-style-probe-size');
        const probeBreakpoint = document.getElementById('e2e-style-probe-breakpoint');
        if (!probeSize || !probeBreakpoint) return false;

        const sizeStyle = window.getComputedStyle(probeSize);
        const breakpointStyle = window.getComputedStyle(probeBreakpoint);
        const expectedDesktop = window.innerWidth >= 768;
        const breakpointOk = expectedDesktop
          ? breakpointStyle.display === 'block'
          : breakpointStyle.display === 'none';

        return (
          locale.length > 0 &&
          route.includes(targetPath) &&
          sizeStyle.width === '16px' &&
          sizeStyle.height === '16px' &&
          breakpointOk
        );
      },
      { targetPath: expectedPath },
      { timeout: 15000 }
    );
  } catch (error) {
    const details = await page.evaluate(() => {
      const root = document.documentElement;
      const probeSize = document.getElementById('e2e-style-probe-size');
      const probeBreakpoint = document.getElementById('e2e-style-probe-breakpoint');
      const probeSizeStyle = probeSize ? window.getComputedStyle(probeSize) : null;
      const probeBreakpointStyle = probeBreakpoint ? window.getComputedStyle(probeBreakpoint) : null;
      return {
        url: window.location.href,
        e2eShellReady: root.dataset.e2eShellReady || null,
        e2eRoute: root.dataset.e2eRoute || null,
        e2eLocale: root.dataset.e2eLocale || null,
        probeSizeExists: Boolean(probeSize),
        probeBreakpointExists: Boolean(probeBreakpoint),
        probeSizeWidth: probeSizeStyle?.width || null,
        probeSizeHeight: probeSizeStyle?.height || null,
        probeBreakpointDisplay: probeBreakpointStyle?.display || null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    throw new Error(
      `App readiness style gate failed: ${JSON.stringify(details)}; original=${String(error)}`
    );
  }
}

async function waitForPageReady(page, auditPath) {
  const u = new URL(page.url());
  const pathname = u.pathname;
  if (routeUsesAppShell(pathname)) {
    await waitForAppReady(page, readinessPath(auditPath));
  } else {
    await waitForPublicPageReady(page);
  }
}

async function ensureAuthenticated(page, firstAuditPath) {
  if (SKIP_AUTH) return;

  const targetUrl = `${BASE_URL}${firstAuditPath}`;
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  if (!page.url().includes('/login')) return;

  async function attemptLoginViaApi(email) {
    const res = await page.context().request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email,
        password: PASSWORD,
      },
      failOnStatusCode: false,
    });
    return { ok: res.ok(), status: res.status() };
  }

  async function verifyAuth() {
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    return !page.url().includes('/login');
  }

  if (LOGIN_EMAIL) {
    let loginStatus = 0;
    for (let i = 0; i < 3; i += 1) {
      const loginResult = await attemptLoginViaApi(LOGIN_EMAIL);
      loginStatus = loginResult.status;
      if (loginResult.ok && (await verifyAuth())) return;
      if (loginStatus === 429) await sleep(1200 * (i + 1));
    }
    throw new Error(
      `Could not authenticate for layout audit using LAYOUT_AUDIT_EMAIL=${LOGIN_EMAIL}. ` +
        `Last login status=${loginStatus}.`
    );
  }

  if (ALLOW_REGISTER) {
    const email = uniqueEmail(TEST_EMAIL);
    let registerStatus = 0;
    for (let i = 0; i < 3; i += 1) {
      const registerRes = await page.context().request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          email,
          password: PASSWORD,
          name: 'Layout Audit',
        },
        failOnStatusCode: false,
      });
      registerStatus = registerRes.status();
      if (registerRes.ok() && (await verifyAuth())) return;
      if (registerStatus === 429) await sleep(1200 * (i + 1));
    }

    throw new Error(
      `Could not register/login audit user (status=${registerStatus}). ` +
        'Set LAYOUT_AUDIT_EMAIL to an existing account, or retry later if rate-limited.'
    );
  }

  throw new Error(
    'Auth required for layout audit. Set LAYOUT_AUDIT_EMAIL (existing account) and E2E_TEST_PASSWORD. ' +
      'If you want auto-register, run with LAYOUT_AUDIT_ALLOW_REGISTER=1. ' +
      'For public pages only, use LAYOUT_AUDIT_SKIP_AUTH=1.'
  );
}

async function keyboardTabSmoke(page, maxSteps) {
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press('Tab');
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return { ok: false, tag: null };
      const tag = el.tagName;
      if (tag === 'BODY' || tag === 'HTML') return { ok: false, tag };
      return {
        ok: true,
        tag,
        id: el.id || undefined,
        role: el.getAttribute('role') || undefined,
      };
    });
    if (landed.ok) {
      return { ok: true, tabsUsed: i + 1, landedOn: landed };
    }
  }
  return { ok: false, tabsUsed: maxSteps, reason: 'focus_stayed_on_body_or_html' };
}

async function collectAudit(page, stateName) {
  return page.evaluate(
    ({ targets, stateNameValue, minTouchPx }) => {
      const pickStyles = [
        'display',
        'position',
        'boxSizing',
        'width',
        'maxWidth',
        'minWidth',
        'height',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'gap',
        'justifyContent',
        'alignItems',
        'overflow',
        'overflowX',
        'overflowY',
        'zIndex',
      ];

      const items = [];
      for (const target of targets) {
        const elements = Array.from(document.querySelectorAll(target.selector));
        const selected = target.all ? elements : elements.slice(0, 1);

        selected.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          const style = {};
          pickStyles.forEach((k) => {
            style[k] = cs[k];
          });
          const visible =
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            Number.parseFloat(cs.opacity || '1') > 0 &&
            rect.width > 0 &&
            rect.height > 0;
          items.push({
            group: target.name,
            selector: target.selector,
            index,
            el,
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
            visible,
            rect: {
              x: Math.round(rect.x * 100) / 100,
              y: Math.round(rect.y * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              height: Math.round(rect.height * 100) / 100,
              right: Math.round(rect.right * 100) / 100,
              bottom: Math.round(rect.bottom * 100) / 100,
            },
            style,
          });
        });
      }

      const visibleItems = items.filter((e) => e.visible);
      const isContaining = (outer, inner) =>
        outer.x <= inner.x &&
        outer.y <= inner.y &&
        outer.right >= inner.right &&
        outer.bottom >= inner.bottom;
      const overlaps = [];
      let overlapsSkippedDomNested = 0;
      for (let i = 0; i < visibleItems.length; i += 1) {
        for (let j = i + 1; j < visibleItems.length; j += 1) {
          if (visibleItems[i].group === visibleItems[j].group) continue;
          const elI = visibleItems[i].el;
          const elJ = visibleItems[j].el;
          if (elI.contains(elJ) || elJ.contains(elI)) {
            overlapsSkippedDomNested += 1;
            continue;
          }
          const a = visibleItems[i].rect;
          const b = visibleItems[j].rect;
          if (isContaining(a, b) || isContaining(b, a)) continue;
          const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
          const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
          const area = ix * iy;
          if (area > 64) {
            overlaps.push({
              a: `${visibleItems[i].group}[${visibleItems[i].index}]`,
              b: `${visibleItems[j].group}[${visibleItems[j].index}]`,
              area: Math.round(area * 100) / 100,
            });
          }
        }
      }

      const entries = items.map(({ el: _el, ...rest }) => rest);
      const visibleEntries = entries.filter((e) => e.visible);

      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const scroll = {
        docWidth: document.documentElement.scrollWidth,
        docHeight: document.documentElement.scrollHeight,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };

      const offscreen = visibleEntries
        .filter((e) => e.rect.x < -1 || e.rect.right > viewport.width + 1)
        .map((e) => ({
          id: `${e.group}[${e.index}]`,
          rect: e.rect,
        }));

      const tapInteractiveSelector =
        'main a[href], main button, main input[type="submit"], main [role="button"], aside nav a, aside button, header button, header a[href]';
      const smallTapTargets = [];
      document.querySelectorAll(tapInteractiveSelector).forEach((el, index) => {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible =
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          Number.parseFloat(cs.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0;
        if (!visible) return;
        const w = rect.width;
        const h = rect.height;
        const minDim = Math.min(w, h);
        if (minDim + 0.5 < minTouchPx) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || '';
          const aria = el.getAttribute('aria-label') || '';
          smallTapTargets.push({
            index,
            tag,
            role,
            ariaLabel: aria.slice(0, 80),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
            width: Math.round(w * 100) / 100,
            height: Math.round(h * 100) / 100,
            minDim: Math.round(minDim * 100) / 100,
          });
        }
      });

      const mainH1 = document.querySelectorAll('main h1').length;

      return {
        state: stateNameValue,
        url: window.location.href,
        title: document.title,
        viewport,
        scroll,
        entries,
        overlaps,
        overlapMeta: { skippedDomNested: overlapsSkippedDomNested },
        offscreen,
        ux: {
          minTouchPx,
          smallTapTargets,
          mainH1Count: mainH1,
        },
      };
    },
    { targets: TARGETS, stateNameValue: stateName, minTouchPx: MIN_TOUCH_PX }
  );
}

function buildMarkdownReport({ baseUrl, paths, runs }) {
  const lines = [
    '# Layout & touch-target audit',
    '',
    `Generated: **${new Date().toISOString()}**`,
    `Base URL: \`${baseUrl}\``,
    `Paths: ${paths.map((p) => `\`${p}\``).join(', ')}`,
    `Small tap target threshold: **${MIN_TOUCH_PX}px** (min of width × height per control)`,
    '',
    '## How to read this',
    '',
    '- **Overlaps**: different layout groups with intersecting boxes > 64px². Pairs where one node **contains** the other in the DOM are **skipped** (e.g. buttons inside cards) to reduce noise.',
    '- **Horizontal overflow**: document wider than viewport — usually worth fixing on mobile.',
    '- **Small tap targets**: interactive controls smaller than the threshold on the shortest side — review on **mobile** screenshots (WCAG 2.5.5 recommends 44×44 CSS px).',
    '- **main h1 count**: ideally `1` per view for screen-reader structure.',
    '- **Keyboard smoke** (if enabled): after several `Tab` presses, focus should land on a real control (not bare `BODY`/`HTML`).',
    '',
    '## Results',
    '',
  ];

  for (const run of runs) {
    const { auditPath, state, report, screenshotRelative } = run;
    const { overlaps, scroll, offscreen, ux } = report;
    const smallN = ux.smallTapTargets?.length ?? 0;
    const h1 = ux.mainH1Count ?? 0;
    const flags = [];
    if (scroll.hasHorizontalOverflow) flags.push('horizontal overflow');
    if (overlaps.length) flags.push(`${overlaps.length} overlap(s)`);
    if (offscreen.length) flags.push(`${offscreen.length} offscreen`);
    if (smallN) flags.push(`${smallN} small tap target(s)`);
    if (h1 !== 1) flags.push(`main h1 count = ${h1}`);
    const kbd = ux.keyboardTabSmoke;
    if (kbd && !kbd.ok) flags.push(`keyboard Tab smoke: ${kbd.reason || 'failed'}`);

    lines.push(`### \`${auditPath}\` — ${state}`);
    lines.push('');
    lines.push(`![${state}](${screenshotRelative})`);
    lines.push('');
    lines.push(flags.length ? `- **Flags:** ${flags.join('; ')}` : '- **Flags:** none');
    const skippedNested = report.overlapMeta?.skippedDomNested ?? 0;
    lines.push(
      `- Overlaps: ${overlaps.length} (DOM-nested candidates skipped: ${skippedNested}) · Offscreen: ${offscreen.length} · Small taps: ${smallN}`
    );
    if (kbd?.ok) {
      lines.push(`- Keyboard: focus after ${kbd.tabsUsed} Tab(s) on \`${kbd.landedOn?.tag}\`${kbd.landedOn?.id ? ` (#${kbd.landedOn.id})` : ''}`);
    }
    if (smallN > 0 && smallN <= 12) {
      lines.push('');
      lines.push('| min side | size | text / aria |');
      lines.push('| ---: | --- | --- |');
      for (const t of ux.smallTapTargets) {
        const label = t.ariaLabel || t.text || t.tag;
        lines.push(`| ${t.minDim} | ${t.width}×${t.height} | ${label.replace(/\|/g, '\\|')} |`);
      }
    } else if (smallN > 12) {
      lines.push('');
      lines.push(`_(${smallN} small targets — see JSON for full list)_`);
    }
    lines.push('');
  }

  lines.push('## Env reference');
  lines.push('');
  lines.push('| Variable | Purpose |');
  lines.push('| --- | --- |');
  lines.push('| `LAYOUT_AUDIT_PATHS` | Comma list: `app,account` or full `/fr/app/stats` |');
  lines.push('| `LAYOUT_AUDIT_DECK_ID` | Appends `/app/decks/{id}` (alphanumeric + hyphens) |');
  lines.push('| `LAYOUT_AUDIT_INCLUDE_STUDY` | `1` = also `/app/decks/{id}/study` |');
  lines.push('| `LAYOUT_AUDIT_STUDY_QUERY` | Study URL query, e.g. `atRiskOnly=true` |');
  lines.push('| `LAYOUT_AUDIT_SKIP_AUTH` | `1` = do not login (public pages only) |');
  lines.push('| `LAYOUT_AUDIT_MIN_TOUCH_PX` | Warn when min(width,height) below this (default 44) |');
  lines.push('| `LAYOUT_AUDIT_FAIL_ON_HORIZONTAL_OVERFLOW` | `1` = exit 1 if doc is wider than viewport |');
  lines.push('| `LAYOUT_AUDIT_FAIL_ON_MOBILE_OVERFLOW_ONLY` | `1` = overflow check only for `mobile-*` states |');
  lines.push('| `LAYOUT_AUDIT_MAX_SMALL_TAPS` | If set, exit 1 when any page exceeds this count |');
  lines.push('| `LAYOUT_AUDIT_MAX_OVERLAPS` | If set, exit 1 when overlap count exceeds this |');
  lines.push('| `LAYOUT_AUDIT_KEYBOARD_SMOKE` | `1` = Tab through until focus leaves body |');
  lines.push('| `LAYOUT_AUDIT_KEYBOARD_TAB_STEPS` | Max Tab presses for keyboard smoke (default 8) |');
  lines.push('| `LAYOUT_AUDIT_OUT_DIR` | Output directory |');
  lines.push('');
  return lines.join('\n');
}

function shouldFailOverflow(stateName, hasOverflow) {
  if (!hasOverflow) return false;
  if (FAIL_ON_MOBILE_OVERFLOW_ONLY) return stateName.includes('mobile');
  if (FAIL_ON_HORIZONTAL_OVERFLOW) return true;
  return false;
}

function collectThresholdViolations(allReports) {
  const violations = [];
  const maxSmall =
    MAX_SMALL_TAPS_RAW !== '' ? Number.parseInt(MAX_SMALL_TAPS_RAW, 10) : Number.NaN;
  const maxOverlaps =
    MAX_OVERLAPS_RAW !== '' ? Number.parseInt(MAX_OVERLAPS_RAW, 10) : Number.NaN;
  const smallThresholdOk = MAX_SMALL_TAPS_RAW === '' || !Number.isNaN(maxSmall);
  const overlapThresholdOk = MAX_OVERLAPS_RAW === '' || !Number.isNaN(maxOverlaps);

  if (MAX_SMALL_TAPS_RAW !== '' && Number.isNaN(maxSmall)) {
    violations.push({
      type: 'config',
      detail: `Invalid LAYOUT_AUDIT_MAX_SMALL_TAPS=${JSON.stringify(MAX_SMALL_TAPS_RAW)}`,
    });
  }
  if (MAX_OVERLAPS_RAW !== '' && Number.isNaN(maxOverlaps)) {
    violations.push({
      type: 'config',
      detail: `Invalid LAYOUT_AUDIT_MAX_OVERLAPS=${JSON.stringify(MAX_OVERLAPS_RAW)}`,
    });
  }

  for (const { auditPath, state, report } of allReports) {
    if (shouldFailOverflow(state, report.scroll?.hasHorizontalOverflow)) {
      violations.push({
        type: 'horizontal_overflow',
        auditPath,
        state,
        url: report.url,
      });
    }
    const smallN = report.ux?.smallTapTargets?.length ?? 0;
    if (smallThresholdOk && MAX_SMALL_TAPS_RAW !== '' && smallN > maxSmall) {
      violations.push({
        type: 'small_taps',
        auditPath,
        state,
        count: smallN,
        max: maxSmall,
      });
    }
    const ov = report.overlaps?.length ?? 0;
    if (overlapThresholdOk && MAX_OVERLAPS_RAW !== '' && ov > maxOverlaps) {
      violations.push({
        type: 'overlaps',
        auditPath,
        state,
        count: ov,
        max: maxOverlaps,
      });
    }
    const kbd = report.ux?.keyboardTabSmoke;
    if (KEYBOARD_SMOKE && kbd && !kbd.ok) {
      violations.push({
        type: 'keyboard_smoke',
        auditPath,
        state,
        reason: kbd.reason || 'failed',
      });
    }
  }

  return violations;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const auditPaths = expandAuditPaths();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await ensureAuthenticated(page, auditPaths[0]);

  const allReports = [];
  const markdownRuns = [];

  for (const auditPath of auditPaths) {
    const slug = pathToSlug(auditPath);
    for (const state of STATES) {
      await page.setViewportSize(state.viewport);
      await page.goto(`${BASE_URL}${auditPath}`, { waitUntil: 'networkidle' });

      if (state.openMenu && routeUsesAppShell(new URL(page.url()).pathname)) {
        const openMenuButton = page.getByRole('button', { name: /open menu/i });
        if (await openMenuButton.count()) {
          await openMenuButton.click();
        }
      }

      await waitForPageReady(page, auditPath);
      await page.waitForTimeout(150);
      const report = await collectAudit(page, state.name);
      const fileBase = `${slug}__${state.name}`;
      const screenshotPath = path.join(OUT_DIR, `${fileBase}.png`);
      const jsonPath = path.join(OUT_DIR, `${fileBase}.json`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      if (KEYBOARD_SMOKE) {
        report.ux.keyboardTabSmoke = await keyboardTabSmoke(page, KEYBOARD_TAB_STEPS);
      }
      await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

      allReports.push({ auditPath, state: state.name, report });
      markdownRuns.push({
        auditPath,
        state: state.name,
        report,
        screenshotRelative: `${fileBase}.png`,
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    paths: auditPaths,
    deckId: sanitizeDeckId(DECK_ID_RAW) || undefined,
    includeStudy: INCLUDE_STUDY || undefined,
    studyQuery: STUDY_QUERY_RAW || undefined,
    minTouchPx: MIN_TOUCH_PX,
    runs: allReports.map(({ auditPath, state, report }) => ({
      auditPath,
      state,
      url: report.url,
      hasHorizontalOverflow: report.scroll.hasHorizontalOverflow,
      overlaps: report.overlaps.length,
      overlapSkippedDomNested: report.overlapMeta?.skippedDomNested ?? 0,
      offscreenNodes: report.offscreen.length,
      smallTapTargets: report.ux?.smallTapTargets?.length ?? 0,
      mainH1Count: report.ux?.mainH1Count ?? 0,
      keyboardTabOk: report.ux?.keyboardTabSmoke?.ok,
      totalNodesCaptured: report.entries.length,
    })),
  };

  const violations = collectThresholdViolations(allReports);
  summary.thresholdViolations = violations;
  summary.thresholds = {
    failOnHorizontalOverflow: FAIL_ON_HORIZONTAL_OVERFLOW,
    failOnMobileOverflowOnly: FAIL_ON_MOBILE_OVERFLOW_ONLY,
    maxSmallTaps: MAX_SMALL_TAPS_RAW !== '' ? Number.parseInt(MAX_SMALL_TAPS_RAW, 10) : null,
    maxOverlaps: MAX_OVERLAPS_RAW !== '' ? Number.parseInt(MAX_OVERLAPS_RAW, 10) : null,
    keyboardSmoke: KEYBOARD_SMOKE,
  };

  await writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(
    path.join(OUT_DIR, 'REPORT.md'),
    buildMarkdownReport({ baseUrl: BASE_URL, paths: auditPaths, runs: markdownRuns }),
    'utf8'
  );

  await browser.close();
  console.log(`Layout audit written to ${OUT_DIR}`);
  if (sanitizeDeckId(DECK_ID_RAW)) {
    console.log(
      `Deck routes: deck detail${INCLUDE_STUDY ? ' + study' : ''}${STUDY_QUERY_RAW ? ` (?${STUDY_QUERY_RAW.replace(/^\?/, '')})` : ''}`
    );
  }
  console.log(`Open ${path.join(OUT_DIR, 'REPORT.md')} for UX-oriented summary + screenshot links.`);

  if (violations.length > 0) {
    await writeFile(path.join(OUT_DIR, 'violations.json'), JSON.stringify(violations, null, 2), 'utf8');
    console.error(`Layout audit thresholds failed (${violations.length} violation(s)). See violations.json`);
    for (const v of violations) {
      const loc = [v.auditPath, v.state].filter(Boolean).join(' ');
      const extra =
        v.detail ||
        (v.count != null ? `count=${v.count} max=${v.max}` : '') ||
        v.reason ||
        loc;
      console.error(' -', v.type, extra);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Layout audit failed:', error);
  process.exit(1);
});
