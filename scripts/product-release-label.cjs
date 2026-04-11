/**
 * Single product release label for frontend + backend + Docker + CI.
 * Reads semver from repo root package.json; appends +<shortSha> when GITHUB_SHA or GIT_SHA is set (not "unknown").
 */
const { readFileSync } = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const v = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const sha = process.env.GITHUB_SHA || process.env.GIT_SHA || '';
const short = sha && sha !== 'unknown' ? String(sha).slice(0, 7) : '';
process.stdout.write(short ? `${v}+${short}` : String(v));
