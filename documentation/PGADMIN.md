# pgAdmin and MemoOn-Card Postgres

pgAdmin must run on the same Docker network as Postgres so it can use the container name as host. We use the external network **db-admin-net**.

## Steps

1. Create the network once: `docker network create db-admin-net`
2. Start Postgres: `yarn postgres` (or `docker compose up -d postgres`)
3. Start pgAdmin on that network. Either:
   - From a separate compose that uses `db-admin-net`, run `docker compose up -d` there, or
   - One-off: `docker run -d --name pgadmin --network db-admin-net -p 5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@local.dev -e PGADMIN_DEFAULT_PASSWORD=admin dpage/pgadmin4:latest`
4. Open http://localhost:5050, then in pgAdmin → Add New Server:

| Field    | Value              |
|----------|--------------------|
| Host     | **postgres**       |
| Port     | **5432**           |
| Database | **memoon_card_db** |
| Username | **postgres**       |
| Password | **postgres**       |

Use **postgres** as host (not localhost). If you get "Name does not resolve", pgAdmin isn’t on `db-admin-net` — start it with `--network db-admin-net` or run `docker network connect db-admin-net <pgadmin-container-name>`.
