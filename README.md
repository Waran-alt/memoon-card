# Memoon Card

A standalone application for [brief description of what memoon-card does].

## 🏗️ Project Structure

```
memoon-card/
├── frontend/              # Frontend application
├── backend/               # Backend API
├── migrations/            # Database migrations (Liquibase)
├── documentation/         # Project documentation
├── docker-compose.yml     # Docker Compose configuration
└── .env.example          # Environment variables template
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 22.0.0
- Yarn 4.9.2+ (or npm)
- Docker & Docker Compose
- PostgreSQL 17+

### Development Setup

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

### Database Migrations

```bash
# Run migrations
yarn migrate:up

# Or using Liquibase directly
cd migrations
liquibase update
```

## 📚 Documentation

See `documentation/` directory for detailed documentation.

## 🔧 Tech Stack

- **Frontend**: [To be configured]
- **Backend**: [To be configured]
- **Database**: PostgreSQL 17
- **Migrations**: Liquibase
- **Containerization**: Docker

## 📝 License

[To be specified]
