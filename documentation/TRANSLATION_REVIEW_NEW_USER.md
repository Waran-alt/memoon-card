# Translation review: new user perspective

Short review of UI strings so they make sense to someone who has never used the app. Focus: clarity, no unexplained jargon, natural wording in both English and French.

---

## Issues found and changes made

### 1. “Study health” / “Santé étude”

- **Problem:** For a new user, “Study health” is vague (health of what?). In French, “Santé étude” is unnatural: “santé” usually needs a complement (“santé de quoi?”), and “étude” alone doesn’t clearly mean “revision activity”.
- **Change:**  
  - **Nav (common):** EN → “Stats & health”, FR → “Stats et révisions”.  
  - **Dashboard page (app):** EN → “Review stats & system health”, FR → “Statistiques de révision et état du système”.  
- **Rationale:** “Stats”/“Statistiques” and “révisions” tell the user the page is about revision activity and numbers; “health”/“état du système” stays for the technical/operational side without sounding like medical health.

### 2. “Study and auth health” / “Santé étude et auth”

- **Problem:** “Auth” is developer jargon; “auth health” is unclear to end users. “Santé étude” in French has the same issue as above.
- **Change:** Replaced by the dashboard titles above. Removed “auth” from user-facing copy.
- **Rationale:** The page is about review activity and system status; no need to mention “auth” in the UI.

### 3. Dashboard intro (technical wording)

- **Problem:** EN: “Operational trends for auth refresh, consistency, latency, and throughput.” FR: “Tendances opérationnelles pour refresh auth, cohérence, latence et débit.” Too technical for a typical user.
- **Change:**  
  - EN: “Overview of your review activity, session consistency, and service status.”  
  - FR: “Vue d'ensemble de votre activité de révision, de la cohérence des sessions et de l'état du service.”  
- **Rationale:** Same meaning, but in plain language (activity, consistency, status instead of refresh/latency/throughput).

### 4. Study sessions intro

- **Problem:** “Data consistency health” / “santé de cohérence des données” is technical and heavy.
- **Change:**  
  - EN: “View your recent sessions and check that your data is in sync.”  
  - FR: “Consultez vos sessions récentes et vérifiez que vos données sont bien synchronisées.”  
- **Rationale:** “In sync”/“synchronisées” is easier to grasp than “data consistency health.”

### 5. “View study health dashboard” (link)

- **Problem:** Same “study health” wording; FR “Voir le tableau de santé” is very generic (could suggest a medical dashboard).
- **Change:**  
  - EN: “View stats & health dashboard”.  
  - FR: “Voir les stats et l'état du système”.  
- **Rationale:** Aligns with the nav and page title; “état du système” avoids the medical connotation.

---

## Other notes (unchanged for now)

- **Again / Hard / Good / Easy:** Left in English in the FR locale on purpose (familiar to flashcard users; matches common apps like Anki). Can be translated later if you want full FR UI.
- **Deck / Decks:** Kept as borrowed term in French in nav (“Decks” in common); “deck” is used in app strings (e.g. “Créer un deck”). Fine for a flashcard app.
- **Recto / Verso:** In French these are standard for “front/back” of a card; no change. In EN we use “Front (recto)” and “Back (verso)” for clarity.
- **Chart labels** (e.g. “Refresh failures”, “Journey mismatch rate”, “Study API latency”): Still somewhat technical but appear in a dedicated stats page where context is clear; can be refined in a later pass if you want even plainer wording.

---

## Where to edit

- **Nav labels:** `frontend/public/locales/{en,fr}/common.json` → `studyHealth`, `studySessions`, `optimizer`, etc.
- **App copy (dashboard, sessions, deck, study):** `frontend/public/locales/{en,fr}/app.json`.
- After changing a key’s value, run tests that mock translations (e.g. `AppLayoutShell.test.tsx`, `StudyHealthPage.test.tsx`, `StudySessionsPage.test.tsx`) and update the mock/assertion if they use that key.

---

## Summary

| Context | Before (EN) | After (EN) | Before (FR) | After (FR) |
|--------|-------------|------------|-------------|------------|
| Nav item | Study health | Stats & health | Santé étude | Stats et révisions |
| Dashboard title | Study and auth health | Review stats & system health | Santé étude et auth | Statistiques de révision et état du système |
| Dashboard intro | Operational trends for auth refresh… | Overview of your review activity… | Tendances opérationnelles pour refresh auth… | Vue d'ensemble de votre activité de révision… |
| Sessions intro | …data consistency health | …data is in sync | …santé de cohérence des données | …données sont bien synchronisées |
| Link to dashboard | View study health dashboard | View stats & health dashboard | Voir le tableau de santé | Voir les stats et l'état du système |

These updates make the “study health” area understandable to a new user in both languages and avoid jargon like “auth” and “Santé étude” in the main UI.
