# Déploiement MemoOn-Card sur Hostinger (CI/CD GitHub)

> Revue secrets / HTTPS / deploiement : croiser avec `documentation/private/CODEBASE_AUDIT_GRID.md` (sections 7 et 1).

Mise en place : **push sur `main` ou `master`** → GitHub Actions déclenche le déploiement sur le VPS Hostinger via l’API Hostinger. Le fichier **`docker-compose.deploy.yml`** est une **copie fusionnée** (une seule section `services`) de l’app prod et de l’observabilité : Hostinger exige une section `services` à la racine et n’accepte pas un fichier qui ne contient que `include`. À **maintenir aligné** avec `docker-compose.prod.yml` et `docker-compose.monitoring.yml` si vous modifiez ces fichiers. Les configs d’observabilité sont **intégrées aux images** (`monitoring/Dockerfile.prometheus`, `Dockerfile.loki`, etc.) : le répertoire `/docker/memoon-card/monitoring` n’a pas besoin d’exister au **runtime** sur le VPS (le build clone le dépôt et construit ces images).

## Prérequis

- Un **VPS Hostinger** avec Docker (template Docker disponible dans le panel).
- **RAM** : l’observabilité ajoute plusieurs conteneurs ; un VPS très petit peut saturer (surveiller avec `docker stats`). Le compose impose des **plafonds CPU/mémoire** sur les services de monitoring (`deploy.resources`) et une rétention courte par défaut (Prometheus **7j** via `PROMETHEUS_RETENTION`, Loki **7j** dans `monitoring/loki-config.yaml`). Détail et pistes d’allègement : `monitoring/README.md` section « Ressources (VPS) ».
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
| `GRAFANA_ADMIN_PASSWORD` | **Secret** | Recommandé | — | Mot de passe administrateur Grafana (stack monitoring déployée avec l’app). **À définir** : sans secret, une valeur vide peut être envoyée et empêcher Grafana de démarrer correctement. Pour **ne pas** déployer le monitoring, remplacez dans le workflow `docker-compose-path: docker-compose.deploy.yml` par `docker-compose.prod.yml`. |
| `HOSTINGER_VM_ID` | **Variable** | Oui | — | ID du VPS (ex. dans l’URL hPanel : `.../vps/123456/overview` → `123456`) |
| `NEXT_PUBLIC_API_URL` | **Variable** | Recommandé | — | URL publique de l’app, ex. `https://memoon-card.focus-on-pixel.com` (sans slash final). **En Variable**, pas en Secret. Sans cela, le front peut appeler une mauvaise API (ERR_NAME_NOT_RESOLVED). |
| `CORS_ORIGIN` | **Variable** | Recommandé | — | Origine CORS, en général la même que `NEXT_PUBLIC_API_URL`. **En Variable**, pas en Secret. |
| `GRAFANA_ROOT_URL` | (VPS `.env` ou Variable) | Non | `http://127.0.0.1:3333` | URL publique **HTTPS** de Grafana si vous utilisez Nginx devant le proxy (ex. `https://grafana.example.com`). À définir sur le **VPS** dans le `.env` du projet (le compose ne l’envoie pas par défaut depuis GitHub). Voir section *Grafana par sous-domaine*. |
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
| `AUTH_RATE_LIMIT_WINDOW_MS` | Variable | (interne) | Fenêtre du rate limit pour POST login et register uniquement. |
| `AUTH_RATE_LIMIT_MAX` | Variable | (interne) | Nombre max de tentatives login/register par fenêtre (refresh/session exclus). |
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

### Rechargement de page → redirection vers login

Si l'utilisateur est déconnecté après un rechargement (F5) alors qu'il était connecté, les causes probables sont :

1. **En-têtes proxy manquants** : le backend définit le cookie `refresh_token` pour le domaine reçu via `X-Forwarded-Host` ou `Host`. Si Nginx ne transmet pas ces en-têtes au backend, le cookie peut être défini pour le mauvais domaine (ex. `backend:4002`) et le navigateur ne l'enverra pas lors des requêtes suivantes. Vérifiez que le bloc proxy vers le backend contient bien :
   ```nginx
   proxy_set_header Host $host;
   proxy_set_header X-Forwarded-Host $host;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```

2. **CORS_ORIGIN incorrect** : le backend n'autorise le cookie que si le `Host` reçu correspond à une origine CORS autorisée. Vérifiez que `CORS_ORIGIN` (ou `CORS_ORIGINS`) est défini avec le domaine public exact (ex. `https://memoon-card.focus-on-pixel.com`).

3. **Cookies non transmis** : assurez-vous que Nginx ne supprime pas les en-têtes `Set-Cookie` de la réponse du backend (comportement par défaut). Si le proxy modifie les réponses, les cookies peuvent être perdus.

4. **Refresh token expiré** : si le token de rafraîchissement a expiré (7 jours par défaut), la session est invalide. Rediriger vers login est alors normal.

### Si le déploiement n’applique pas les changements

**Comportement Hostinger** : au déclenchement (push ou redeploy), Hostinger clone le dépôt au **bon commit** (celui de l’URL envoyée par le workflow), utilise `docker-compose.prod.yml` de ce clone, puis lance le build des images. **Si le build échoue** (erreur TypeScript, dépendance, etc.), les conteneurs ne sont pas mis à jour et le site continue avec l’ancienne image — d’où l’impression que « rien ne change ». Il faut donc **consulter les logs de build** pour voir l’erreur réelle.

**Consulter le log de build (SSH)** : sur le VPS, le log du dernier build est en général dans le dossier du projet, par ex. :

```bash
cat /docker/memoon-card/.build.log
```

Vous y verrez le commit utilisé (`Using commit: ...`), l’étape qui a échoué (ex. `RUN yarn build` dans le frontend) et le message d’erreur (ex. `Type error`). Corriger le code en local, commit/push, puis relancer un déploiement.

**Dossier projet sans git** : sur beaucoup d’installations, le dossier `/docker/memoon-card` sur le VPS **n’est pas un dépôt git** (pas de `.git`) : il contient `docker-compose.yml`, `backend/`, `frontend/`, etc., déposés par le Docker Manager. On ne peut pas y faire de `git pull`. Le clone utilisé pour le build est temporaire ; seul le résultat (images/containers) est conservé.

**Version affichée (en bas à gauche)** : elle est fournie par l’API `/api/version`, servie par le **backend** (Nginx proxy tout `/api` vers le backend). Le backend lit `GIT_SHA` depuis les variables d'environnement (passées par le workflow). Si vous voyez « vdev » en prod, c’est soit que le build a échoué et qu’une ancienne image tourne encore, soit que `GIT_SHA` n’était pas défini lors du build. Une fois le build réussi avec `GIT_SHA` transmis, la version affichée correspond au commit déployé.

**Si le projet sur le VPS est un clone git** (présence de `.git` dans le dossier) : vous pouvez mettre à jour le code puis reconstruire à la main (`git fetch` / `git reset`, puis `yarn compose -f docker-compose.deploy.yml build --no-cache` et `yarn docker:deploy:up`, ou équivalent app seule : `… -f docker-compose.prod.yml …` et `yarn docker:prod:up`). Sinon, relancer un déploiement depuis le panel Hostinger (Redeploy) après avoir corrigé l’erreur visible dans `.build.log`.

## Logs centralisés (Loki, Promtail, Grafana)

Stack **self-host** optionnel : agrège les journaux **stdout/stderr** des conteneurs `memoon-card-backend(-prod)`, `memoon-card-frontend(-prod)`, `memoon-card-postgres(-prod)`.

- Fichiers : `docker-compose.monitoring.yml`, `monitoring/` (config Loki, Promtail, provisioning Grafana).
- Guide détaillé : `monitoring/README.md`.
- Sur le VPS (dans le dossier du projet, avec un `.env` contenant au minimum un mot de passe fort pour Grafana) :

```bash
yarn docker:monitoring:up
```

Ou en combinant avec l’app : `yarn docker:prod:monitoring:up` (fusionne `.env`, `backend/.env`, `frontend/.env` via `scripts/compose-with-env.sh`). Sans Yarn sur le VPS : `bash scripts/compose-with-env.sh -f docker-compose.monitoring.yml up -d` ou la même commande avec les deux `-f`.

**Sécurité (défaut)** : Grafana et Loki sont publiés sur **127.0.0.1** uniquement ; accès via **tunnel SSH** (ex. `ssh -L 3333:127.0.0.1:3333 user@vps`). Définir `GRAFANA_ADMIN_PASSWORD` dans `.env` (voir `env.example`). Ne pas exposer Grafana sur Internet sans **HTTPS** et un **mot de passe fort** (et éventuellement une couche d’auth supplémentaire).

**CI/CD** : le workflow `.github/workflows/deploy-hostinger.yml` utilise **`docker-compose.deploy.yml`**, qui déploie aussi ce monitoring à chaque push.

### Grafana par sous-domaine (HTTPS, optionnel)

Vous pouvez servir Grafana sur une URL publique du type `https://grafana.votredomaine.com` **sans** ouvrir le port Docker sur `0.0.0.0` : laissez le compose tel quel (**127.0.0.1:3333** → conteneur Grafana) et placez **Nginx** (ou Caddy, Traefik) sur le VPS en **reverse proxy** vers `http://127.0.0.1:3333`, avec certificat TLS (Let’s Encrypt, etc.).

1. **DNS** : enregistrement `A` (ou `AAAA`) pour `grafana.votredomaine.com` vers l’IP du VPS.
2. **Mot de passe** : `GRAFANA_ADMIN_PASSWORD` fort (secret GitHub / `.env` sur le VPS).
3. **URL canonique Grafana** : dans le `.env` à la racine du projet sur le VPS (fusionné par le compose), définir :
   - `GRAFANA_ROOT_URL=https://grafana.votredomaine.com`  
   (sans slash final). Cela alimente `GF_SERVER_ROOT_URL` (évite les redirections et cookies incorrects derrière HTTPS).
4. **Redémarrer Grafana** après changement d’env : `docker compose -f docker-compose.deploy.yml up -d grafana` (ou `docker restart memoon-card-grafana` selon votre contexte).
5. **Nginx** : exemple prêt à adapter dans le dépôt : **`monitoring/nginx-grafana.example.conf`** (proxy vers `127.0.0.1:3333`, en-têtes `X-Forwarded-*` / `Host`).

**À ne pas exposer** sur Internet : Prometheus, Loki, cAdvisor — restent en **127.0.0.1** ; les métriques et logs passent par **Grafana** (datasources + Explore).

**Renforcement** : optionnellement **auth HTTP** Nginx (`auth_basic`) en plus du login Grafana, **liste d’IPs**, **Cloudflare Access**, ou VPN. Le fichier d’exemple contient un bloc commenté pour `auth_basic`.

**Panneau dev (frontend)** : pour que le lien « Grafana » dans `/app/dev` pointe vers la même URL, définissez au **build** du frontend `NEXT_PUBLIC_DEV_GRAFANA_URL=https://grafana.votredomaine.com` (variable GitHub Actions ou `.env` frontend), puis redéployez le frontend.

#### Checklist hPanel Hostinger (ordre pratique)

1. **Noter l’IP du VPS** : hPanel → **VPS** → votre instance → **Overview** (adresse IPv4 publique).
2. **DNS du sous-domaine Grafana** : hPanel → **Domaines** → choisir le domaine → **Enregistrements DNS** / **Zone DNS** (libellé variable selon l’interface).
   - Ajouter un enregistrement **A** : **Nom / Hôte** = `grafana` (ou `@` si vous utilisez le domaine nu, non recommandé pour Grafana) → **Cible / Points vers** = **IP du VPS** → TTL 300 ou 3600.
   - Si le domaine n’est **pas** chez Hostinger, créez le même enregistrement **A** chez votre registrar.
   - Attendre la propagation (souvent quelques minutes ; jusqu’à 48 h). Vérifier : `dig grafana.votredomaine.com` ou un outil « DNS lookup » en ligne.
3. **Ce que le panneau ne fait pas** : Hostinger ne configure pas automatiquement Nginx ni `GRAFANA_ROOT_URL` pour Grafana. Après le DNS, il faut **SSH sur le VPS** (hPanel → VPS → **SSH access** / clé ou mot de passe) pour :
   - installer ou compléter **Nginx** + **certificat** (Let’s Encrypt : `certbot --nginx -d grafana.votredomaine.com`) ;
   - ajouter un **fichier de site** dérivé de `monitoring/nginx-grafana.example.conf` ;
   - éditer le **`.env`** du projet (ex. `/docker/memoon-card/.env`) : `GRAFANA_ROOT_URL=https://grafana.votredomaine.com`, puis `docker compose … up -d grafana` ou `docker restart memoon-card-grafana`.
4. **Secret Grafana** : déjà géré via **`GRAFANA_ADMIN_PASSWORD`** (secret GitHub / `.env`) — ne pas le mettre en clair dans hPanel sauf si votre flux de déploiement l’impose chiffré.
5. **Frontend (lien dev)** : dans GitHub → **Settings → Secrets and variables → Actions → Variables**, ajouter **`NEXT_PUBLIC_DEV_GRAFANA_URL`** = `https://grafana.votredomaine.com` (sans slash final), puis **Redeploy** ou un push pour reconstruire le frontend.

## Réinitialiser la base Postgres et libérer l’espace disque (SSH)

Ces opérations se font en **SSH sur le VPS**. L’interface Hostinger (Docker Manager) permet de supprimer un **conteneur** ou de retirer le **montage** d’un volume dans la config du conteneur, mais cela **ne supprime pas le volume Docker** sur le disque. Tant que le volume existe, au prochain redéploiement le conteneur Postgres le remonte et affiche « Skipping initialization ». Il faut donc supprimer le volume (et éventuellement le conteneur) en ligne de commande.

### Où se trouve le projet sur le VPS

Sous Hostinger, le dépôt est en général dans **`/docker/memoon-card`**. Pour vérifier :

```bash
find / -type d -name "*memoon*" 2>/dev/null
```

Le répertoire du projet est en général `/docker/memoon-card`. Hostinger peut y déposer `docker-compose.yml` (et non `docker-compose.prod.yml`) ; le dossier n’est souvent pas un clone git (pas de `.git`). Si le compose attendu n’est pas présent, on supprime uniquement le volume (méthode 2 ci-dessous).

### Méthode 1 : Avec le compose (réinitialiser la base)

Si dans le dossier du projet vous avez le fichier compose (souvent `docker-compose.yml` ou `docker-compose.prod.yml`) :

```bash
cd /docker/memoon-card
yarn compose -f docker-compose.yml down -v
# ou prod : yarn compose -f docker-compose.prod.yml down -v
# sans Yarn : bash scripts/compose-with-env.sh -f docker-compose.prod.yml down -v
```

Cela arrête les conteneurs du stack et supprime les volumes (dont Postgres). Ensuite, redéployez depuis le panel Hostinger ou GitHub.

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

    # Backend API (port 4002) – Host et X-Forwarded-Host pour le cookie de session
    location /api {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
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

**Récap des ports** : le frontend écoute sur **3002**, le backend sur **4002** (bind sur `127.0.0.1`). Nginx doit tourner sur le VPS et rediriger vers ces ports ; les conteneurs sont lancés par Docker après chaque déploiement. En plus, en **127.0.0.1** uniquement : Grafana **3333**, Loki **3100**, Prometheus **9090**, cAdvisor **8088** (voir `monitoring/README.md`, accès tunnel SSH).

## Fonctionnement

1. **Workflow** : `.github/workflows/deploy-hostinger.yml`
   - Déclenché sur **push** vers `main` ou `master` (ou manuellement via *workflow_dispatch*).
   - Utilise l’action officielle `hostinger/deploy-on-vps@v2`.
   - Envoie le repo sur le VPS et exécute **`docker compose -f docker-compose.deploy.yml`** (build + up), fichier unique fusionnant app et observabilité.

2. **Compose déployé** : `docker-compose.deploy.yml` → app (`postgres`, `backend`, `frontend`) + observabilité (Loki, Promtail, Grafana, Prometheus, cAdvisor).
   - Les variables d’environnement (dont `POSTGRES_PASSWORD`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `GRAFANA_ADMIN_PASSWORD`) sont fournies par le workflow.
   - **Sans monitoring** : dans le workflow, remplacer `docker-compose-path: docker-compose.deploy.yml` par `docker-compose.prod.yml`.

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
| `docker-compose.deploy.yml` | Point d’entrée Hostinger : prod + monitoring fusionnés (aligner avec prod + monitoring si vous les modifiez) |
| `docker-compose.prod.yml` | Stack prod (Postgres, backend, frontend) |
| `docker-compose.monitoring.yml` | Loki, Promtail, Grafana, Prometheus, cAdvisor |
| `monitoring/Dockerfile.prometheus` (et `.loki`, `.promtail`, `.grafana`) | Images avec configs embarquées (évite les bind-mounts `./monitoring/...` absents sur le VPS) |
| `backend/Dockerfile` | Image backend (target `runner`) |
| `frontend/Dockerfile` | Image frontend (target `runner`, build arg `NEXT_PUBLIC_API_URL`) |
