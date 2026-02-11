# Command Reference

Use these commands from the repository root.

## Core Development

- `yarn install` - install all workspace dependencies
- `yarn dev:backend` - run backend locally
- `yarn dev:frontend` - run frontend locally
- `yarn dev` - run compose stack in attached mode

## Docker Stack

- `yarn docker:up` - start full stack in background
- `yarn docker:down` - stop and remove containers
- `yarn docker:down:volumes` - stop and remove containers + volumes
- `yarn docker:build` - build all images
- `yarn docker:build:backend` - build backend image only
- `yarn docker:build:frontend` - build frontend image only
- `yarn docker:restart` - restart all services
- `yarn docker:restart:backend` - restart backend service
- `yarn docker:restart:frontend` - restart frontend service
- `yarn docker:logs` - tail logs for all services
- `yarn docker:logs:backend` - tail backend logs
- `yarn docker:logs:frontend` - tail frontend logs

## Database and Migrations

- `yarn postgres` - start only Postgres container
- `yarn postgres:down` - stop Postgres container
- `yarn migrate:up` - run Liquibase locally
- `yarn migrate:status` - show Liquibase status locally
- `yarn migrate:docker` - run Liquibase using the project Docker image

## Quality and Tests

- `yarn test` - run frontend + backend unit tests
- `yarn test:frontend` - run frontend tests
- `yarn test:backend` - run backend tests
- `yarn test:e2e:install` - install Playwright browsers
- `yarn test:e2e` - run Playwright smoke tests
- `yarn test:e2e:ui` - run Playwright with UI
- `yarn test:e2e:headed` - run Playwright in headed mode
- `yarn lint` - run frontend + backend lint checks
- `yarn type-check` - run frontend + backend type checks
- `yarn check` - run type-check + lint

## Maintenance

- `yarn clean` - clean frontend + backend build artifacts
- `yarn lockfile:refresh` - refresh lockfile in project-compatible format

