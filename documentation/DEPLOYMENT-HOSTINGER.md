# Déploiement MemoOn-Card sur Hostinger (CI/CD GitHub)

Mise en place inspirée du projet VatMan : **push sur `main` ou `master`** → GitHub Actions déclenche le déploiement sur le VPS Hostinger via l’API Hostinger. Les conteneurs sont construits et relancés automatiquement.

## Prérequis

- Un **VPS Hostinger** avec Docker (template Docker disponible dans le panel).
- Un dépôt GitHub (public ou privé) avec le code MemoOn-Card.

## Configuration une fois

### 1. GitHub – Secrets et variables

Dans le dépôt : **Settings → Secrets and variables → Actions**.

**Secrets (obligatoires) :**

| Secret | Description |
|--------|-------------|
| `HOSTINGER_API_KEY` | Clé API Hostinger : [hPanel → Profile → API](https://hpanel.hostinger.com/profile/api) |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL de production |
| `JWT_SECRET` | Secret JWT (au moins 32 caractères) |

**Variables :**

| Variable | Description |
|----------|-------------|
| `HOSTINGER_VM_ID` | ID de la machine VPS (ex. dans l’URL hPanel : `.../vps/123456/overview` → `123456`) |
| `NEXT_PUBLIC_API_URL` | (optionnel) URL publique de l’API, ex. `https://memoon-card.example.com` |
| `CORS_ORIGIN` | (optionnel) Origine CORS, en général la même que l’URL du front |

### 2. Dépôt privé

Pour un dépôt privé, configurer une [clé de déploiement SSH Hostinger](https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/) pour que l’action puisse cloner le repo sur le VPS.

### 3. VPS – Docker et reverse proxy

- Docker (et Docker Compose) doivent être installés sur le VPS.
- Nginx (ou autre reverse proxy) devant les conteneurs :
  - `https://votre-domaine` → frontend (port 3002)
  - `https://votre-domaine/api` → backend (port 4002)

## Fonctionnement

1. **Workflow** : `.github/workflows/deploy-hostinger.yml`
   - Déclenché sur **push** vers `main` ou `master` (ou manuellement via *workflow_dispatch*).
   - Utilise l’action officielle `hostinger/deploy-on-vps@v2`.
   - Envoie le repo sur le VPS et exécute `docker compose -f docker-compose.prod.yml` (build + up).

2. **Compose prod** : `docker-compose.prod.yml`
   - Services : `postgres`, `backend`, `frontend`.
   - Les variables d’environnement (dont `POSTGRES_PASSWORD`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`) sont fournies par le workflow.

Après configuration, un **simple push sur `main`/`master`** met à jour les conteneurs sur Hostinger.

## VPS déjà utilisé par un autre projet

Si le même VPS héberge déjà une autre app, en général **aucune adaptation** n’est nécessaire :

- **Répertoire** : l’action Hostinger utilise `project-name: memoon-card`. Chaque projet est déployé dans son propre dossier (ex. `memoon-card` pour celui-ci).
- **Conteneurs / réseau** : les noms sont déjà spécifiques au projet (`memoon-card-postgres-prod`, `memoon-card-backend-prod`, etc.) et le réseau est `memoon-card-prod`. Pas de conflit avec un autre stack.
- **Ports** : MemoOn-Card utilise **3002** (frontend) et **4002** (backend). Si l’autre projet utilise d’autres ports, tout cohabite. En revanche, si un autre service utilise déjà 3002 ou 4002 sur le VPS, il faut changer les ports (voir ci‑dessous).

**En cas de conflit de ports** : définir d’autres ports via des variables d’environnement et les utiliser dans un override ou une copie du compose. Par exemple frontend en 3012 et backend en 4012, puis adapter le reverse proxy (nginx) pour ce projet.

## Mise à jour d’un déploiement existant

Si MemoOn-Card est **déjà déployé** sur ce VPS : **rien à adapter**. Chaque push sur `main`/`master` déclenche un nouveau déploiement :

- Le repo est mis à jour dans le même répertoire projet.
- `docker compose up -d --build` recrée les conteneurs avec les nouvelles images.
- Le volume Postgres (`postgres_data_prod`) est conservé : les données ne sont pas perdues.

## Résumé des fichiers

| Fichier | Rôle |
|---------|------|
| `.github/workflows/deploy-hostinger.yml` | Déploiement automatique sur push |
| `docker-compose.prod.yml` | Stack prod (Postgres, backend, frontend) |
| `backend/Dockerfile` | Image backend (target `runner`) |
| `frontend/Dockerfile` | Image frontend (target `runner`, build arg `NEXT_PUBLIC_API_URL`) |
