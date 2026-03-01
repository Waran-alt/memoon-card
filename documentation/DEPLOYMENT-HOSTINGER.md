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
- Le stack `docker-compose.prod.yml` inclut un service **migrate** (Liquibase) qui s’exécute au démarrage après Postgres : les migrations sont appliquées automatiquement à chaque déploiement. Le backend ne démarre qu’une fois les migrations terminées.
- Nginx (ou autre reverse proxy) devant les conteneurs :
  - `https://votre-domaine` → frontend (port 3002)
  - `https://votre-domaine/api` → backend (port 4002)

## Configuration nginx pour MemoOn-Card (guide pas à pas)

Nginx sert de reverse proxy devant les conteneurs Docker : il reçoit les requêtes HTTPS et les envoie au frontend (Next.js) ou au backend (API) selon le chemin.

### Étape 1 – Connexion au VPS

Depuis votre machine :

```bash
ssh root@VOTRE_IP_VPS
```

(Remplacez par l’utilisateur et l’IP fournis par Hostinger.)

### Étape 2 – DNS

Dans Hostinger (hPanel) ou chez votre registrar : créez un **enregistrement A** pour le sous-domaine qui servira l’app, pointant vers l’IP du VPS.

- **Nom** : par ex. `memoon-card` (pour `memoon-card.votredomaine.com`) ou le sous-domaine de votre choix.
- **Valeur** : IP du VPS.
- **TTL** : 300 ou 3600.

Attendez quelques minutes (jusqu’à 48 h selon les DNS) que la propagation soit faite. Vérifiez avec `dig memoon-card.votredomaine.com` ou un outil en ligne.

### Étape 3 – Installer nginx

Sur le VPS :

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

Vérifiez que nginx tourne : `sudo systemctl status nginx`.

### Étape 4 – Obtenir un certificat SSL (HTTPS)

**Option A – Let’s Encrypt (recommandé)**

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d memoon-card.votredomaine.com
```

Remplacez `memoon-card.votredomaine.com` par le nom de domaine réel. Répondez aux questions (email, conditions). Certbot créera les certificats et ajustera nginx. Les fichiers seront dans `/etc/letsencrypt/live/memoon-card.votredomaine.com/` (ex. `fullchain.pem`, `privkey.pem`).

**Option B – SSL Hostinger**

Si le domaine et le certificat sont gérés dans hPanel, notez les chemins des fichiers certificat sur le VPS (ou copiez-les) pour les utiliser à l’étape 5.

### Étape 5 – Fichier de site nginx pour MemoOn-Card

Créez un fichier dédié au site (remplacez `memoon-card.votredomaine.com` par votre domaine) :

```bash
sudo nano /etc/nginx/sites-available/memoon-card
```

Collez la configuration suivante en adaptant **le nom de domaine** et, si besoin, **les chemins SSL** :

```nginx
# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name memoon-card.votredomaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name memoon-card.votredomaine.com;

    # SSL (Let's Encrypt – adapter le chemin au nom de domaine)
    ssl_certificate     /etc/letsencrypt/live/memoon-card.votredomaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/memoon-card.votredomaine.com/privkey.pem;

    # Frontend Next.js (port 3002)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API (port 4002)
    location /api {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check backend
    location /health {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Si vous n’utilisez pas Let’s Encrypt, modifiez uniquement `ssl_certificate` et `ssl_certificate_key` pour pointer vers vos fichiers (option B).

Enregistrez et quittez (`Ctrl+O`, `Entrée`, `Ctrl+X` avec nano).

### Étape 6 – Activer le site et recharger nginx

```bash
sudo ln -s /etc/nginx/sites-available/memoon-card /etc/nginx/sites-enabled/
sudo nginx -t
```

Si `nginx -t` affiche « syntax is ok » et « test is successful », rechargez nginx :

```bash
sudo systemctl reload nginx
```

### Étape 7 – Vérification

- Ouvrez `https://memoon-card.votredomaine.com` : la page d’accueil MemoOn-Card doit s’afficher.
- Les appels API passent par le même domaine (`/api/...`), donc CORS et cookies fonctionnent correctement si l’app est configurée pour cette URL.

### Étape 8 – Variables GitHub (si pas déjà fait)

Dans le dépôt : **Settings → Secrets and variables → Actions → Variables**.

Définissez (avec votre domaine réel, sans slash final) :

- **`NEXT_PUBLIC_API_URL`** : `https://memoon-card.votredomaine.com`
- **`CORS_ORIGIN`** : `https://memoon-card.votredomaine.com`

Cela assure que le frontend et le backend utilisent bien l’URL HTTPS en production.

---

**Récap des ports** : le frontend écoute sur **3002**, le backend sur **4002** (bind sur `127.0.0.1`). Nginx doit tourner sur le VPS et rediriger vers ces ports ; les conteneurs sont lancés par Docker après chaque déploiement.

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
