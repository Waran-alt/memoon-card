# Memoon Card

MemoOn-Card is a flashcards web application that uses a Spaced Repetition System (SRS) algorithm to help users memorize and retain information effectively.

## About

MemoOn-Card provides an intelligent flashcard system that adapts to your learning pace. The SRS algorithm schedules reviews based on your performance, optimizing study sessions for maximum retention with minimal effort.

## 🏗️ Project Structure

```
memoon-card/
├── frontend/              # Frontend application
├── backend/               # Backend API
├── migrations/            # Database migrations (Liquibase)
│   ├── changelog.xml      # Main changelog file
│   └── changesets/        # Individual migration files
├── documentation/         # Project documentation
├── client.config.json     # Portfolio client configuration
├── docker-compose.yml     # Docker Compose configuration
├── .env.example          # Environment variables template
└── package.json          # Workspace root configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 22.0.0
- Yarn 4.9.2+ (or npm)
- Docker & Docker Compose
- PostgreSQL 17+

### Development Setup

**Standalone Development:**

```bash
# Install dependencies
cd frontend && yarn install
cd ../backend && yarn install

# Copy environment files
cp .env.example .env
# Edit .env with your configuration

# Start services with Docker Compose
docker-compose up -d

# Or run individually
cd frontend && yarn dev
cd ../backend && yarn dev
```

**Integrated with Portfolio:**

```bash
# From Portfolio root
cd /home/waran/dev/Portfolio

# Discover clients (includes memoon-card)
yarn discover:clients

# Run database migrations
yarn migrate:client memoon-card

# Start all services (Portfolio + all clients)
docker-compose up -d
```

### Database Migrations

```bash
# Run migrations (from Portfolio root)
yarn migrate:client memoon-card

# Or using Liquibase directly
cd migrations
liquibase update
```

## 🔧 Tech Stack

- **Frontend**: [To be configured]
- **Backend**: [To be configured]
- **Database**: PostgreSQL 17
- **Migrations**: Liquibase
- **Containerization**: Docker & Docker Compose

## 📚 Documentation

See `documentation/` directory for detailed documentation.

## 🔗 Links

- **Repository**: [https://github.com/Waran-alt/memoon-card.git](https://github.com/Waran-alt/memoon-card.git)
- **Portfolio Integration**: Managed as a Git submodule in the Portfolio monorepo
- **Configuration**: See `client.config.json` for Portfolio integration settings

## 📝 License

[To be specified]