# Déploiement MemoOn-Card sur Hostinger (CI/CD GitHub)

Mise en place : **push sur `main` ou `master`** → GitHub Actions déclenche le déploiement sur le VPS Hostinger via l’API Hostinger. Les conteneurs sont construits et relancés automatiquement.

## Prérequis

- Un **VPS Hostinger** avec Docker (template Docker disponible dans le panel).
- Un dépôt GitHub (public ou privé) avec le code MemoOn-Card.

## Configuration une fois

### 1. GitHub – Secrets et variables (à configurer au bon endroit)

Dans le dépôt : **Settings → Secrets and variables → Actions**. Il y a deux onglets : **Repository** (par défaut) et **Environments**. Pour ce déploiement, tout se configure au niveau **Repository** (pas dans un environment).

Le workflow utilise deux types d’entrées :
- **Secrets** : données sensibles (mots de passe, clés API). Référencés dans le workflow par `secrets.NOM`.
- **Variables** : configuration non sensible (URLs, IDs). Référencées par `vars.NOM`.

Si vous mettez une valeur en **Secret** alors que le workflow lit une **Variable** (ou l’inverse), elle ne sera pas utilisée (ex. `NEXT_PUBLIC_API_URL` en secret alors que le workflow utilise `vars.NEXT_PUBLIC_API_URL` → valeur vide au déploiement).

**Où mettre quoi (tout au niveau Repository) :**

| Nom | Type | Obligatoire | Défaut | Description |
|-----|------|-------------|--------|-------------|
| `HOSTINGER_API_KEY` | **Secret** | Oui | — | Clé API Hostinger : [hPanel → Profile → API](https://hpanel.hostinger.com/profile/api) |
| `POSTGRES_PASSWORD` | **Secret** | Oui | — | Mot de passe PostgreSQL de production |
| `JWT_SECRET` | **Secret** | Oui | — | Secret JWT (au moins 32 caractères) |
| `HOSTINGER_VM_ID` | **Variable** | Oui | — | ID du VPS (ex. dans l’URL hPanel : `.../vps/123456/overview` → `123456`) |
| `NEXT_PUBLIC_API_URL` | **Variable** | Recommandé | — | URL publique de l’app, ex. `https://memoon-card.focus-on-pixel.com` (sans slash final). **En Variable**, pas en Secret. Sans cela, le front peut appeler une mauvaise API (ERR_NAME_NOT_RESOLVED). |
| `CORS_ORIGIN` | **Variable** | Recommandé | — | Origine CORS, en général la même que `NEXT_PUBLIC_API_URL`. **En Variable**, pas en Secret. |
| `POSTGRES_DB` | **Variable** | Non | `memoon_card_db` | Nom de la base. Vous pouvez en choisir un autre (ex. `memooncard_db`). |
| `POSTGRES_USER` | **Variable** | Non | `postgres` | Utilisateur PostgreSQL. Vous pouvez choisir un autre utilisateur (ex. `memooncard`). |
| `DEV_EMAIL`, `DEV_PASSWORD`, `DEV_USERNAME` | **Secrets** | Non | — | Compte « dev » créé/mis à jour au démarrage du backend. Les trois doivent être renseignés pour activer (voir section « Compte dev » ci-dessous). |

Les variables non renseignées restent vides côté GitHub ; le compose applique alors les valeurs par défaut (`postgres`, `memoon_card_db`). Si vous utilisez un **utilisateur ou une base personnalisés** (ex. `memooncard` / `memooncard_db`), définissez `POSTGRES_USER` et `POSTGRES_DB` dans les Variables, puis assurez-vous que le **volume PostgreSQL est vide** au premier démarrage du conteneur : Postgres ne crée l’utilisateur et la base qu’à l’initialisation. Si un volume existait déjà (créé avec d’autres identifiants), supprimez-le sur le VPS avant de redéployer (voir section « Réinitialiser la base Postgres et libérer l’espace disque (SSH) » ci-dessous).

**Autres variables supportées par le backend (optionnel)**  
Le backend lit d’autres variables définies dans `backend/src/config/env.ts`. Elles ne sont **pas** envoyées par le workflow Hostinger par défaut. Pour les utiliser en prod, il faut les ajouter au workflow (Variables) et au `docker-compose.prod.yml` (section `backend.environment`), ou les renseigner dans le panel Hostinger si le compose les transmet déjà.

| Nom | Type | Défaut | Description |
|-----|------|--------|-------------|
| `JWT_ACCESS_EXPIRES_IN` | Variable | `15m` | Durée de vie du token d’accès (ex. `15m`, `1h`). **Recommandé en prod / mobile :** `1h` pour limiter les déconnexions (le frontend rafraîchit le token avant expiration). |
| `JWT_REFRESH_EXPIRES_IN` | Variable | `7d` | Durée de vie du token de rafraîchissement (ex. `7d`, `30d`). |
| `CORS_ORIGINS` | Variable | — | Liste d’origines CORS séparées par des virgules (remplace `CORS_ORIGIN` si défini). |
| `RATE_LIMIT_WINDOW_MS` | Variable | `900000` | Fenêtre du rate limit global (ms). |
| `RATE_LIMIT_MAX` | Variable | `300` | Nombre max de requêtes par fenêtre (rate limit global). |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Variable | (interne) | Fenêtre du rate limit auth (login/register/refresh). |
| `AUTH_RATE_LIMIT_MAX` | Variable | (interne) | Nombre max de requêtes auth par fenêtre. |
| `MAX_REQUEST_SIZE` | Variable | `10mb` | Taille max du body des requêtes. |
| `FSRS_METRICS_JOB_ENABLED` | Variable | — | `true` ou `false` pour activer/désactiver le job FSRS. |
| `FSRS_METRICS_JOB_INTERVAL_MINUTES` | Variable | — | Intervalle du job FSRS (minutes). |
| `FSRS_METRICS_JOB_BACKFILL_DAYS` | Variable | — | Nombre de jours de backfill du job FSRS. |
| `ADAPTIVE_RETENTION_ENABLED` | Variable | — | `true` / `false` pour la rétention adaptive. |
| `ADAPTIVE_RETENTION_MIN` / `_MAX` / `_DEFAULT` / `_STEP` | Variable | — | Paramètres de la rétention adaptive. |
| `ADAPTIVE_POLICY_VERSION` | Variable | — | Version de la politique (télémétrie). |

**Tokens et mobile (prod)**  
En production, sur mobile, le token d’accès (15 min par défaut) peut expirer pendant que l’utilisateur garde l’onglet ouvert, ce qui oblige à se reconnecter. Pour limiter cela : (1) définir la variable **`JWT_ACCESS_EXPIRES_IN=1h`** dans GitHub (Actions → Variables) ; (2) le frontend rafraîchit déjà le token **avant** expiration (environ 2 min avant) et au **retour sur l’onglet** (visibility change). Avec un token à 1 h et un refresh proactif, les déconnexions en usage mobile sont nettement réduites.

**Compte « dev » (optionnel)**  
Si vous définissez les trois variables suivantes, le backend crée ou met à jour un utilisateur avec le rôle `dev` à chaque démarrage. Utile pour un accès technique sur un VPS de staging ou de démo. À mettre en **Secrets** (Repository) pour ne pas exposer le mot de passe.

| Nom | Type | Description |
|-----|------|-------------|
| `DEV_EMAIL` | Secret | Email du compte dev (identifiant de connexion). |
| `DEV_PASSWORD` | Secret | Mot de passe du compte dev. |
| `DEV_USERNAME` | Secret | Nom affiché (optionnel ; peut rester vide). |

Les trois doivent être renseignés pour activer la fonctionnalité. Au premier démarrage, l’utilisateur est créé avec `role = 'dev'` et une ligne `user_settings` par défaut ; aux démarrages suivants, le mot de passe et le nom sont mis à jour si besoin.

**Repository vs Environment (rappel) :**
- **Repository** : secrets et variables disponibles pour tous les workflows du dépôt (sauf si un environment restreint l’accès). C’est ce qu’on utilise ici.
- **Environment** : ensemble de secrets/variables lié à un nom (ex. `production`). Utile pour des règles d’approbation ou des valeurs différentes par environnement. Pour Hostinger, inutile d’en créer un : tout en Repository suffit.

**Dépannage : `role "…" does not exist` / `password authentication failed for user "…"`**  
Cela signifie que les identifiants envoyés au backend (`POSTGRES_USER`, `POSTGRES_DB`) ne correspondent pas à ceux avec lesquels le **volume PostgreSQL a été initialisé** la première fois. Postgres ne crée l’utilisateur et la base qu’au **premier** démarrage sur un volume vide.  
**Si vous voulez garder vos données :** utilisez exactement les mêmes `POSTGRES_USER`, `POSTGRES_DB` et `POSTGRES_PASSWORD` que lors du premier déploiement.  
**Si vous voulez utiliser un autre utilisateur/base (ex. `memooncard` / `memooncard_db`) :** il faut repartir d’un volume vide. Voir la section **« Réinitialiser la base Postgres et libérer l’espace disque (SSH) »** ci-dessous pour la procédure détaillée.

### 2. Dépôt privé

Pour un dépôt privé, configurer une [clé de déploiement SSH Hostinger](https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/) pour que l’action puisse cloner le repo sur le VPS.

### 3. VPS – Docker et reverse proxy

- Docker (et Docker Compose) doivent être installés sur le VPS.
- Le stack `docker-compose.prod.yml` n’a pas de conteneur dédié aux migrations : le **backend** exécute Liquibase au démarrage (avant de lancer le serveur), puis écoute sur le port 4002. Les migrations sont appliquées automatiquement à chaque redémarrage du backend.
- Nginx (ou autre reverse proxy) devant les conteneurs :
  - `https://votre-domaine` → frontend (port 3002)
  - `https://votre-domaine/api` → backend (port 4002)
- **Important – cookies de session** : pour que la reconnexion survive au rechargement de page, le backend doit recevoir l’hôte public et définir le cookie pour ce domaine. Dans la config Nginx du bloc qui proxy vers le backend, ajoutez :
  ```nginx
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  ```
  Ne pas supprimer les en-têtes `Set-Cookie` de la réponse du backend (comportement par défaut). Le frontend reçoit alors le cookie `refresh_token` pour votre domaine et le renvoie à chaque requête (y compris au rechargement). Le conteneur frontend utilise `BACKEND_URL=http://backend:4002` pour que le serveur Next.js (getSession) appelle le backend en interne tout en transmettant les cookies de la requête utilisateur.
- **Voir les logs (SSH)** : `docker logs -f memoon-card-backend-prod` (suivi en direct) ou `docker logs --tail 200 memoon-card-backend-prod` (dernières lignes). Utile en cas d’erreur 502 ou pour déboguer.

## Réinitialiser la base Postgres et libérer l’espace disque (SSH)

Ces opérations se font en **SSH sur le VPS**. L’interface Hostinger (Docker Manager) permet de supprimer un **conteneur** ou de retirer le **montage** d’un volume dans la config du conteneur, mais cela **ne supprime pas le volume Docker** sur le disque. Tant que le volume existe, au prochain redéploiement le conteneur Postgres le remonte et affiche « Skipping initialization ». Il faut donc supprimer le volume (et éventuellement le conteneur) en ligne de commande.

### Où se trouve le projet sur le VPS

Sous Hostinger, le dépôt est en général dans **`/docker/memoon-card`**. Pour vérifier :

```bash
find / -type d -name "*memoon*" 2>/dev/null
```

Le répertoire du projet est celui qui contient (ou devrait contenir) `docker-compose.prod.yml` ; sur beaucoup d’installations c’est `/docker/memoon-card`. Attention : après un déploiement, ce dossier peut ne pas contenir `docker-compose.prod.yml` (le workflow peut déployer depuis un autre contexte). Dans ce cas, on supprime uniquement le volume (méthode 2 ci-dessous).

### Méthode 1 : Avec le compose (si docker-compose.prod.yml est présent)

Si dans le dossier du projet vous avez bien `docker-compose.prod.yml` (après un `git pull` si besoin) :

```bash
cd /docker/memoon-card
git pull origin main   # ou master, selon votre branche
docker compose -f docker-compose.prod.yml down -v
```

Cela arrête les conteneurs du stack et supprime les volumes définis dans ce compose (dont le volume Postgres). Ensuite, redéployez depuis GitHub.

### Méthode 2 : Supprimer uniquement le volume Postgres (recommandé si pas de compose sur le VPS)

Le volume utilisé en prod s’appelle en général **`memoon-card_postgres_data_prod`**. Pour le supprimer :

**Étape 1 – Supprimer le volume (si aucun conteneur ne l’utilise)**

```bash
docker volume rm memoon-card_postgres_data_prod
```

**Si vous avez l’erreur « volume is in use »** : un conteneur (souvent le Postgres) utilise encore le volume. Il faut l’arrêter et le supprimer avant de pouvoir supprimer le volume.

**Étape 2 – Arrêter et supprimer le conteneur Postgres**

```bash
docker ps
docker stop memoon-card-postgres-prod
docker rm memoon-card-postgres-prod
```

(Adaptez le nom du conteneur si `docker ps` affiche un nom différent.)

**Étape 3 – Supprimer le volume**

```bash
docker volume rm memoon-card_postgres_data_prod
```

**Étape 4 – Redéployer** depuis GitHub (bouton « Redeploy » ou nouveau push). Le déploiement recréera le conteneur Postgres et un **nouveau** volume vide ; Postgres initialisera alors l’utilisateur et la base avec les valeurs actuelles de `POSTGRES_USER` et `POSTGRES_DB` (ex. `memooncard` / `memooncard_db`).

### Libérer l’espace disque (images, etc.)

- **`docker compose down -v`** (méthode 1) supprime uniquement les **conteneurs** et les **volumes** de ce compose. Les **images** (postgres, backend, frontend) restent sur le disque.
- Pour libérer plus d’espace (anciennes images, cache), **après** le redéploiement vous pouvez lancer :

```bash
docker image prune -a
```

Cela supprime toutes les images non utilisées par un conteneur (anciennes versions backend/frontend, etc.). Les images utilisées par les conteneurs en cours restent en place. Vous pouvez exécuter cette commande de temps en temps après des déploiements.

- Nettoyage plus agressif (tous les conteneurs arrêtés, tous les volumes non utilisés, toutes les images non utilisées) :

```bash
docker system prune -a --volumes
```

Attention : sur un VPS qui héberge plusieurs projets Docker, cela supprime aussi les ressources inutilisées des autres projets.

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
