# Self-hosted observability (Loki + Prometheus + Grafana)

Stack option **1** from the monitoring discussion: centralize **stdout/stderr** (Loki + Promtail) and optional **metrics** (Prometheus scrapes the backend `/metrics` and cAdvisor for container CPU/memory). On Hostinger, **`docker-compose.deploy.yml`** includes this file with the prod stack (same as `yarn docker:deploy:up` locally).

## Prerequisites

- **Linux** Docker host (VPS) or **WSL2** with Docker: Promtail needs `/var/run/docker.sock`.
- Container names must match `memoon-card-backend`, `memoon-card-frontend`, `memoon-card-postgres` (optional `-prod` suffix). Adjust `monitoring/promtail-config.yaml` if you rename services.

## Run

From the **repository root**:

```bash
# Set a strong password in root .env (see env.example). Env: .env + backend/.env + frontend/.env merged.
yarn docker:monitoring:up
```

With the production app stack:

```bash
yarn docker:prod:monitoring:up
```

## Accéder à Grafana

- URL : `http://127.0.0.1:${GRAFANA_PORT:-3333}` (écoute sur loopback uniquement).
- Depuis votre machine : **tunnel SSH** si Grafana tourne sur un VPS, par ex.  
  `ssh -L 3333:127.0.0.1:3333 user@votre-serveur` puis ouvrir `http://127.0.0.1:3333` en local.
- Identifiants : utilisateur `GRAFANA_ADMIN_USER` (défaut `admin`) et mot de passe `GRAFANA_ADMIN_PASSWORD` (défaut `changeme` — **à changer en production**).

## Métriques (Prometheus)

- **Prometheus** (UI) : `http://127.0.0.1:${PROMETHEUS_PORT:-9090}` — loopback only.
- **cAdvisor** (containers) : `http://127.0.0.1:${CADVISOR_PORT:-8088}` — loopback only.
- **Backend** : exposition Prometheus sur `GET /metrics` lorsque `METRICS_ENABLED` est activé (défaut). Le job `memoon_backend` dans `monitoring/prometheus.yml` cible `backend:4002` ; ce nom DNS existe seulement si vous **fusionnez** le compose monitoring avec le compose app (`yarn docker:prod:monitoring:up`). Sinon le target restera **DOWN** (normal si l’API n’est pas sur le même réseau).

Dans **Grafana** → **Explore** → datasource **Prometheus**, exemples de requêtes **PromQL** :

| Objectif | Exemple |
|----------|---------|
| Requêtes HTTP par seconde (backend) | `rate(memoon_http_requests_total[5m])` |
| Mémoire conteneur (cAdvisor) | `container_memory_usage_bytes{name=~"memoon-card-.*"}` |

**Production** : ne pas exposer `/metrics` sur Internet ; si le backend est derrière nginx, restreindre ou bloquer `/metrics` sauf pour Prometheus (IP interne / réseau Docker).

## Utiliser Grafana (guide rapide)

### 1. Première connexion

Après login, vous arrivez sur le **home**. Les datasources **Loki** et **Prometheus** sont provisionnées (`monitoring/grafana/provisioning/datasources/`).

### 2. Explorer les logs (Explore)

1. Menu **☰** (en haut à gauche) → **Explore** (icône boussole / « Explore »).
2. En haut, choisir la datasource **Loki** (liste déroulante à gauche du champ de requête).
3. **Sélecteur de temps** (coin supérieur droit) : `Last 15 minutes`, `Last 1 hour`, ou une plage personnalisée. Les logs n’apparaissent qu’après ingestion ; si rien ne s’affiche, élargissez la fenêtre.
4. Saisir une requête **LogQL** dans le champ principal, puis **Run query** (ou Entrée).

### 3. LogQL utile pour MemoOn-Card

Les lignes ont des **labels** ajoutés par Promtail, notamment `container` (nom Docker).

| Objectif | Exemple de requête |
|----------|-------------------|
| Tout le backend | `{container=~"memoon-card-backend.*"}` |
| Tout le frontend Next | `{container=~"memoon-card-frontend.*"}` |
| Postgres | `{container=~"memoon-card-postgres.*"}` |
| Lignes contenant un mot | `{container=~"memoon-card-backend.*"} \|= "error"` |
| Regex sur le contenu | `{container=~"memoon-card-backend.*"} \|~ "401\|403"` |
| JSON structuré (logs prod backend) | `{container=~"memoon-card-backend.*"} \| json \| level="error"` |
| Erreurs navigateur remontées par l’API | `{container=~"memoon-card-backend.*"} \| json \| event="client_error"` |

- **`|=`** : la ligne doit contenir cette sous-chaîne.
- **`|~`** : la ligne doit matcher l’expression régulière.
- **`| json`** : interprète la ligne comme JSON ; enchaîner par ex. `| level="error"` si le backend émet des champs `level` / `message` (voir une ligne réelle dans Explore pour ajuster les noms de champs).

### 4. Lire le résultat

- Chaque ligne peut être **dépliée** pour voir les labels (`container`, `stream`, etc.).
- **Volume** : graphique du nombre de lignes dans la plage (utile pour repérer un pic).
- **Live** : bouton pour suivre les nouveaux logs (quasi temps réel).

### 5. Aller plus loin (optionnel)

- **Dashboards** : **☰ → Dashboards → New → Add visualization**, choisir Loki, puis une requête LogQL (souvent en mode « logs » ou « time series » avec `count_over_time`).
- **Alertes** : possibles via **Alerting** + règles Loki (non préconfigurées dans ce compose ; à ajouter si besoin).
- **Préférences** : **☰ → Profile** (thème clair/sombre, langue partielle).

### 6. Dépannage

- **Aucun log** : vérifier que Promtail et Loki sont `Up` (`docker compose ps`), que les conteneurs app ont des noms reconnus par `promtail-config.yaml`, et élargir la plage horaire.
- **Datasource Loki erreur** : Loki doit être joignable depuis le conteneur Grafana sur `http://loki:3100` (réseau Docker `memoon-monitoring`).
- **Prometheus : « Unable to retrieve metric names » / Internal Server Error** : redémarrer Grafana après mise à jour du provisioning (`yarn compose -f docker-compose.monitoring.yml restart grafana`). Vérifier que Prometheus est **Up** (`curl -s http://127.0.0.1:9090/-/healthy` depuis l’hôte). Si la datasource a été modifiée à la main avec **HTTP method POST**, repasser sur **GET** (défaut) ou supprimer la datasource et laisser le fichier `prometheus.yaml` la recréer au prochain démarrage.

## Production notes

- Do not expose Grafana, Loki, Prometheus, or cAdvisor on a public interface; use **SSH tunnel** or **VPN**.
- Retention: **14 days** (`336h`) in `loki-config.yaml`; edit if you need more or less disk use.
- **Browser errors**: in production the app POSTs to `/api/client-errors`; backend logs `event=client_error` (see section below).

## Browser errors → Loki

Production: `window.onerror` and `unhandledrejection` are sent to `POST /api/client-errors` (CSRF + rate limit). Backend stdout JSON includes `event: client_error`. Example LogQL:

`{container=~"memoon-card-backend.*"} | json | event="client_error"`

Disable: set `NEXT_PUBLIC_CLIENT_ERROR_REPORTING=false` on the frontend. Force in dev: `NEXT_PUBLIC_CLIENT_ERROR_REPORTING=true`.

## Volumes

`loki_data`, `prometheus_data`, `grafana_data`, `promtail_positions` persist data; `docker compose down` keeps volumes; add `-v` to remove them.
