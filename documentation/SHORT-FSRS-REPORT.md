# Rapport : Implémentation Short-FSRS

## 1. Vue d'ensemble

Short-FSRS est un modèle de rétention pour la **phase d'apprentissage** (0–2 jours), complémentaire au FSRS long terme. Les cartes passent par Short-FSRS avant de « graduer » vers le FSRS classique (stabilité en jours).

**Modèle** : `R_short(t) = e^(-t / S_short)`  
- `t` = temps écoulé depuis la dernière révision (minutes)  
- `S_short` = `short_stability_minutes`  
- `R_short` = probabilité de rappel

---

## 2. Gestion des cartes oubliées (lapses)

### 2.1 Définition

Une **carte oubliée** (lapse) = carte **graduée** (stabilité en jours) sur laquelle l'utilisateur clique **Again** (rating = 1).

### 2.2 Configuration actuelle

Le passage en apprentissage des lapses est piloté par `learning_apply_to_lapses` et `learning_lapse_within_days` dans `user_settings` :

| Valeur | Comportement |
|--------|--------------|
| `always` | **Tout** lapse repasse en apprentissage Short-FSRS |
| `within_days` | Seulement si le lapse survient dans les `learning_lapse_within_days` jours suivant la dernière révision |
| `off` | Le lapse suit le chemin FSRS classique (pas de ré-entrée en apprentissage) |

**Implémentation** : `LearningConfigService.shouldApplyLearningToLapse()`

```typescript
// learning-config.service.ts
shouldApplyLearningToLapse(card: Card, config: LearningConfig): boolean {
  if (config.applyToLapses === 'off') return false;
  if (config.applyToLapses === 'always') return true;
  if (config.applyToLapses === 'within_days' && config.lapseWithinDays != null && card.last_review) {
    const days = (Date.now() - new Date(card.last_review).getTime()) / (24 * 60 * 60 * 1000);
    return days <= config.lapseWithinDays;
  }
  return false;
}
```

### 2.3 Flux quand un lapse repasse en apprentissage

1. FSRS met à jour `stability` et `difficulty` (chemin lapse classique)
2. `short_stability_minutes` = `getInitialShortStabilityMinutes(rating)` (ex. 5 min pour Again)
3. `learning_review_count` = 1
4. `next_review` = now + intervalle prédit (minutes)
5. `critical_before` et `high_risk_before` sont calculés à partir de la **stabilité FSRS en jours** (pas Short-FSRS)

### 2.4 Limites actuelles

- **Pas d’interface utilisateur** : `apply_to_lapses` et `lapse_within_days` ne sont pas exposés dans le frontend. La valeur par défaut est `always`.
- **Lapse « récent »** : avec `within_days`, la condition porte sur le temps écoulé depuis `last_review`, pas depuis la graduation. Une carte graduée depuis longtemps mais révisée récemment peut donc ne pas repasser en apprentissage selon la config.
- **Pas de notion de « très oubliée »** : une carte due depuis des mois est traitée comme une carte due depuis 1 jour. On pourrait envisager une logique basée sur la retrievability (R) ou l’élapsed time pour forcer la ré-entrée en apprentissage.

---

## 3. critical_before et high_risk_before : adaptation au Short-FSRS

### 3.1 Formule actuelle (FSRS long terme)

```
critical_before = last_review + elapsedDaysAtRetrievability(weights, stability, 0.1)
high_risk_before = last_review + elapsedDaysAtRetrievability(weights, stability, 0.5)
```

- `stability` = stabilité en **jours**
- Formule FSRS : `R = (1 + factor * (elapsedDays / stability))^(-w20)`
- Inverse : `elapsedDays = stability * (R^(-1/w20) - 1) / factor`

### 3.2 Comportement pour les cartes Short-FSRS

| Situation | critical_before / high_risk_before |
|-----------|------------------------------------|
| **Nouvelle carte** (jamais graduée) | `NULL` |
| **Carte en apprentissage** (non graduée) | Conservés de la carte (`card.critical_before`, `card.high_risk_before`) ou `NULL` |
| **Lapse qui repasse en apprentissage** | Calculés à partir de la stabilité FSRS (jours) après le lapse |
| **Graduation** | Calculés à partir de la nouvelle stabilité FSRS (jours) |

### 3.3 Problème

Les champs `critical_before` et `high_risk_before` sont basés sur le **FSRS long terme** (stabilité en jours, formule R en jours). Pour les cartes **en apprentissage**, on a :

- `short_stability_minutes` (minutes)
- Formule Short-FSRS : `R_short(t) = e^(-t / S_short)` avec `t` en minutes

Il n’existe **aucun calcul** de `critical_before` / `high_risk_before` à partir de `short_stability_minutes`. Pour ces cartes :

- Soit on garde les anciennes valeurs (lapse récent)
- Soit on a `NULL` (nouvelle carte)

### 3.4 Conséquences

- **getCriticalCount** / **getHighRiskCount** : filtrent sur `critical_before <= now` et `high_risk_before <= now`.
- Les cartes en apprentissage avec `critical_before = NULL` ne sont **jamais** comptées comme critiques ou à risque.
- Les statistiques « critique(s) » et « en retard » ne reflètent donc pas correctement le risque des cartes en apprentissage.

### 3.5 Adaptation possible

Pour Short-FSRS, l’inverse de `R_short(t) = e^(-t/S_short)` donne :

```
t = S_short * (-ln(R))
```

Exemple pour R = 0.1 : `t = S_short * 2.30` (minutes).

On pourrait introduire :

- `critical_before_short` = `last_review + elapsedMinutesAtRetrievability(short_stability_minutes, 0.1)`
- `high_risk_before_short` = `last_review + elapsedMinutesAtRetrievability(short_stability_minutes, 0.5)`

Et les utiliser pour les cartes en apprentissage, ou fusionner la logique dans les requêtes existantes.

---

## 4. Architecture Short-FSRS

### 4.1 Colonnes `cards`

| Colonne | Type | Rôle |
|---------|------|------|
| `short_stability_minutes` | `double precision` | Stabilité en minutes ; `NULL` hors apprentissage |
| `learning_review_count` | `integer` | Nombre de révisions en apprentissage ; `NULL` hors apprentissage |
| `graduated_from_learning_at` | `timestamptz` | Date de graduation vers le FSRS long terme |

### 4.2 Paramètres `user_settings`

| Paramètre | Rôle |
|-----------|------|
| `learning_graduation_cap_days` | Seuil en jours pour la graduation (ex. 1 jour) |
| `learning_target_retention_short` | Cible R pour prédire l’intervalle (ex. 0.85) |
| `learning_min_interval_minutes` | Intervalle minimum (ex. 1 min) |
| `learning_max_attempts_before_graduate` | Nombre max de révisions avant graduation forcée (ex. 7) |
| `learning_apply_to_lapses` | `always` \| `within_days` \| `off` |
| `learning_lapse_within_days` | Utilisé si `apply_to_lapses = 'within_days'` |
| `learning_short_fsrs_params` | Paramètres ajustés par l’optimiseur (JSON) |

### 4.3 Paramètres Short-FSRS (défauts / optimiseur)

```typescript
// short-fsrs.service.ts
INITIAL_S_SHORT_BY_RATING = { 1: 5, 2: 15, 3: 30, 4: 60 };  // minutes
S_SHORT_AFTER_AGAIN = 5;
GROWTH_BY_RATING = { 1: 0.5, 2: 1.15, 3: 1.4, 4: 1.7 };
```

L’optimiseur Short-FSRS (`short-term-optimization.service.ts`) ajuste ces valeurs à partir des `review_logs` en phase apprentissage.

---

## 5. Flux de révision

### 5.1 Décision de chemin

```
reviewCard()
  → shortTermEnabled && (isNewCard || inLearning || lapseEntersLearning)
    → reviewCardShortFSRS()
  → sinon
    → reviewCard() (FSRS classique)
```

### 5.2 Cas Short-FSRS

| Cas | Comportement |
|-----|--------------|
| **Nouvelle carte** | `short_stability_minutes` = initial selon rating ; `learning_review_count` = 1 |
| **Lapse** (avec `applyToLapses`) | FSRS met à jour stability/difficulty ; ré-entrée en apprentissage avec `short_stability_minutes` initial |
| **Carte en apprentissage** | `updateShortStability()` ; graduation si intervalle ≥ cap ou count ≥ maxAttempts |
| **Graduation** | `short_stability_minutes` = NULL ; `graduated_from_learning_at` = now ; FSRS calcule `next_review` en jours |

### 5.3 Conditions de graduation

1. **Par intervalle** : `intervalMin >= graduationCapDays * 24 * 60` (minutes)
2. **Par nombre de révisions** : `learning_review_count >= maxAttemptsBeforeGraduate`

---

## 6. Optimiseur Short-FSRS

- **Entrée** : `review_logs` avec `review_state` ∈ {0, 1, 3} (New, Learning, Relearning)
- **Sortie** : `learning_short_fsrs_params` (initialSShortByRating, sShortAfterAgain, growthByRating)
- **Éligibilité** : nombre minimal de révisions en phase apprentissage (première exécution vs suivantes)

---

## 7. Recommandations

### 7.1 Cartes oubliées

1. **Exposer la config** : ajouter une UI pour `apply_to_lapses` et `lapse_within_days`.
2. **Clarifier `within_days`** : documenter que la condition porte sur `last_review`, pas sur la date de graduation.
3. **Option « très oubliée »** : envisager une règle du type « si R < seuil ou elapsed > X jours, forcer la ré-entrée en apprentissage ».

### 7.2 critical_before / high_risk_before

1. **Cartes en apprentissage** : calculer des seuils à partir de `short_stability_minutes` (formule Short-FSRS).
2. **Statistiques** : inclure ces cartes dans les compteurs « critique » et « en retard » en utilisant ces seuils.
3. **Recalcul global** : adapter `recomputeRiskTimestampsForUser` pour les cartes en apprentissage (ou une fonction dédiée).

### 7.3 Tests

- Tester les 3 modes `apply_to_lapses` (always, within_days, off).
- Tester le calcul de critical/high_risk pour des cartes en apprentissage.
- Vérifier que les compteurs study-stats reflètent bien les cartes en apprentissage à risque.

---

## 8. Annexes techniques

### 8.0 Ce qui influence short_stability_minutes en base

**Source unique** : le service `review.service.ts` (méthode `reviewCardShortFSRS`) est le seul endroit qui écrit `short_stability_minutes` sur les cartes.

| Événement | Valeur écrite |
|-----------|---------------|
| Nouvelle carte (1ère révision) | `getInitialShortStabilityMinutes(rating)` |
| Lapse qui repasse en apprentissage | `getInitialShortStabilityMinutes(rating)` |
| Carte en apprentissage (révision) | `updateShortStability(sShortOld, elapsedMinutes, rating)` |
| Graduation | `NULL` |

**Booléen à la place ?** Non. `short_stability_minutes` est une **valeur numérique** indispensable pour :
- Prédire le prochain intervalle : `predictIntervalMinutes(sShort, targetRetention)` → `t = S_short * (-ln(R))`
- Calculer `critical_before` / `high_risk_before` (formule Short-FSRS)
- Mettre à jour la stabilité : `updateShortStability(sShort, elapsed, rating)`

Un booléen indiquerait seulement « en apprentissage » (déjà implicite via `IS NOT NULL`), mais on perdrait la valeur nécessaire aux calculs. Le champ doit rester numérique.

---

### 8.0b Vérification : pas de calcul FSRS (S, R) à la première révision

**Flux pour une nouvelle carte** (Short-FSRS activé) :
1. `isNewCard = card.stability === null` → true
2. On entre dans `reviewCardShortFSRS` (jamais dans le chemin FSRS classique)
3. On utilise `getInitialShortStabilityMinutes(rating)`, `predictIntervalMinutes`, etc. — **aucun appel à `fsrs.reviewCard` ni `fsrs.calculateRetrievability`**
4. Dans `logReview`, on passe `previousState = currentState` = `null` (car `card.stability` et `card.difficulty` sont null)
5. Le bloc `if (previousState)` n'est pas exécuté → **pas de calcul de `retrievabilityBefore`** via FSRS
6. `stability_after` et `difficulty_after` viennent du `syntheticResult` (0, 0) — pas du FSRS

**Conclusion** : À la première révision d'une nouvelle carte, on ne calcule ni S ni R avec le FSRS. Seul le Short-FSRS est utilisé.

---

### 8.0c Optimiseur Short-FSRS : fonctionnement

**Données d'entrée** : `review_logs` avec `review_state` ∈ {0, 1, 3} (New, Learning, Relearning).

**Algorithme** (`fitShortFsrsParams`) :
1. Grouper les logs par `card_id`, triés par `review_time`
2. Pour chaque carte, simuler la chaîne de révisions avec `getInitialShortStabilityMinutes` et `updateShortStability`
3. Extraire :
   - **Again (rating=1)** : intervalle réel observé → estimer `sShortAfterAgain` (médiane des intervalles / -ln(0.85))
   - **Première révision (rating 2–4)** : intervalle réel → estimer `initialSShortByRating[rating]`
   - **Révisions suivantes (rating 2–4)** : à partir de `sAfter = intervalReel / LN_TARGET` et `growth = sAfter / (sShort * elapsedFactor)` → médiane des growth par rating
4. Persister dans `user_settings.learning_short_fsrs_params` (JSON)

**Éligibilité** :
- 1ère exécution : ≥ 50 révisions en phase apprentissage
- Exécutions suivantes : ≥ 20 nouvelles révisions OU ≥ 7 jours depuis la dernière optimisation

---

## 9. Proposition d'amélioration du modèle (v2)

### 9.1 critical_before / high_risk_before pour cartes non graduées

**Problème** : Les cartes en apprentissage n'ont pas de critical/high_risk calculés à partir de Short-FSRS (cf. 8.0).

**Solution** : Calculer ces seuils à partir de `short_stability_minutes` avec la formule Short-FSRS.

```
R_short(t) = e^(-t / S_short)  =>  t = S_short * (-ln(R))
```

- `elapsedMinutesAtRetrievability(S_short, 0.1)` = `S_short * 2.303` → critical
- `elapsedMinutesAtRetrievability(S_short, 0.5)` = `S_short * 0.693` → high_risk

**Implémentation** :
- Ajouter `elapsedMinutesAtRetrievability(sShortMinutes: number, targetR: number): number` dans `short-fsrs.service.ts`
- Pour toute carte avec `short_stability_minutes IS NOT NULL` : `critical_before = last_review + elapsedMinutes`, `high_risk_before = last_review + elapsedMinutes`
- Les requêtes `getCriticalCount` / `getHighRiskCount` restent inchangées (elles filtrent sur `critical_before <= now`), mais les cartes en apprentissage auront désormais des valeurs cohérentes

**Alternative** : Ne pas stocker ces valeurs en base pour les cartes en apprentissage, mais les calculer à la volée dans les requêtes (plus complexe, requêtes plus lourdes).

---

### 9.2 Critère fiable pour ré-entrer en apprentissage (lapse)

**Problème** : « Again » sur une carte bien apprise (haute stabilité) force une ré-entrée en apprentissage immédiate. Or, un oubli ponctuel peut justifier une révision dans quelques jours (FSRS) plutôt qu'un retour complet en apprentissage.

**Principe** : Utiliser la **retrievability (R)** ou le **temps écoulé** pour décider :
- Si R est très basse (ex. < 0.5) ou elapsed très long (ex. > 7 jours) → la carte est « oubliée », ré-entrée en apprentissage
- Sinon → traiter comme un lapse FSRS classique (intervalle court, pas de ré-entrée)

**Proposition** :
```
lapseReentersLearning = (R < R_LAPSE_THRESHOLD) || (elapsedDays > ELAPSED_LAPSE_THRESHOLD_DAYS)
```
- `R_LAPSE_THRESHOLD` = 0.5 (ou 0.4) : en dessous, la carte est considérée oubliée
- `ELAPSED_LAPSE_THRESHOLD_DAYS` = 7 (ou configurable) : au-delà, même avec R correcte, on considère que c'est une vraie oubli

**Calcul** : R = `fsrs.calculateRetrievability(elapsedDays, stability)` avant de décider.

**Effet** : Une carte due depuis 2 jours avec R=0.7 → Again → FSRS classique (intervalle court). Une carte due depuis 30 jours avec R=0.1 → Again → ré-entrée en apprentissage.

---

### 9.3 graduated_from_learning_at

**Problème** : Une carte peut graduer plusieurs fois. `graduated_from_learning_at` est écrasé à chaque graduation.

**Historique via review_logs** : Oui. Chaque graduation est enregistrée dans `review_logs` avec `review_state = 2` (Review). On peut retrouver :
- **Nombre de graduations** : `SELECT COUNT(*) FROM review_logs WHERE card_id = X AND review_state = 2`
- **Dernière graduation** : `SELECT MAX(review_time) FROM review_logs WHERE card_id = X AND review_state = 2`

**Conclusion** : `graduated_from_learning_at` est redondant avec `review_logs`. On peut le supprimer et dériver toute l'info depuis les sessions d'étude. Si on garde la colonne, c'est uniquement pour un accès rapide (éviter une jointure sur `review_logs`).

---

### 9.4 stability et difficulty : Short vs FSRS

**Réponse** : Non, ils ne sont pas utilisés à la fois pour Short et FSRS.

| Phase | Données utilisées pour le scheduling |
|-------|--------------------------------------|
| **En apprentissage** | Uniquement `short_stability_minutes` (et `learning_review_count` pour la graduation forcée) |
| **Graduée (FSRS)** | `stability`, `difficulty`, `last_review` |

**Pendant l'apprentissage** :
- `stability` et `difficulty` sont soit 0 (nouvelle carte), soit les valeurs FSRS du dernier état (lapse). Ils ne servent **pas** au calcul des intervalles Short-FSRS.
- À la **graduation** : on passe `(stability, difficulty, lastReview, nextReview)` à `fsrs.reviewCard()` pour obtenir le prochain intervalle FSRS. Donc ces champs sont le « point de départ » FSRS après la sortie de l'apprentissage.

**Conclusion** : Séparation claire. Short-FSRS n'utilise que `short_stability_minutes` ; FSRS utilise `stability` et `difficulty`.

---

### 9.5 learning_max_attempts_before_graduate

**Problème** : Limite arbitraire (ex. 7 révisions) peut forcer une graduation prématurée ou retarder inutilement.

**Proposition** : **Supprimer** la graduation par nombre de tentatives. Ne garder que la graduation par **intervalle** :
- `graduate = shouldGraduateShortTerm(intervalMin, capDays)` (intervalle prédit ≥ cap jours)

**Effet** : Une carte reste en apprentissage tant que l'intervalle prédit reste < cap. Si l'utilisateur clique souvent Again, l'intervalle reste court et la carte ne graduate pas. Plus cohérent avec le modèle.

**Migration** : Supprimer `learning_max_attempts_before_graduate` de la config et du code. Pas de rétrocompatibilité prévue.

---

### 9.6 apply_to_lapses et lapse_within_days

**Proposition** : **Supprimer**. Si Short-FSRS est activé, on l'applique à 100 % aux lapses qui remplissent le critère (cf. 9.2).

**Logique simplifiée** :
```
lapseReentersLearning = shortTermEnabled && (R < R_THRESHOLD || elapsedDays > ELAPSED_THRESHOLD)
```
Plus de `apply_to_lapses` ni `lapse_within_days`.

**Migration** : Supprimer les colonnes, `shouldApplyLearningToLapse` et la logique associée. Remplacer par le critère R/elapsed. Pas de rétrocompatibilité prévue.

---

## 10. Synthèse des changements proposés

| Changement | Action |
|------------|--------|
| critical/high_risk pour cartes en apprentissage | Calculer à partir de `short_stability_minutes` (formule Short-FSRS) |
| Critère lapse → learning | R < 0.5 OU elapsed > 7 jours (configurable) |
| graduated_from_learning_at | Supprimable : dériver depuis `review_logs` (review_state=2) |
| stability/difficulty | Aucun changement (déjà bien séparés) |
| max_attempts_before_graduate | Supprimer ; graduation uniquement par intervalle (pas de rétrocompat) |
| apply_to_lapses / lapse_within_days | Supprimer ; appliquer Short-FSRS à 100 % selon critère R/elapsed (pas de rétrocompat) |
