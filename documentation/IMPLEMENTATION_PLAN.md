# FSRS Implementation Plan

This document outlines the step-by-step plan to implement FSRS v6 in MemoOn Card.

## Overview

**Goal**: Implement a complete flashcard memorization system with FSRS v6 algorithm, risk assessment, and management view handling.

**Timeline**: Estimated 4-6 weeks for full implementation

**Tech Stack**:
- Backend: Express.js + TypeScript + PostgreSQL
- Frontend: Next.js + TypeScript + Tailwind CSS
- Database: PostgreSQL 17+ with Liquibase migrations
- FSRS: v6 with 21 weights

---

## Phase 1: Database Schema (Week 1, Days 1-2)

### 1.1 Core Tables

**Priority: CRITICAL**

Create Liquibase migration for core FSRS tables:

- [ ] `users` table (already exists, may need updates)
- [ ] `decks` table
- [ ] `cards` table (with FSRS state fields)
- [ ] `review_logs` table (for optimization)
- [ ] `user_settings` table (for personalized weights)
- [ ] `card_management_views` table (for tracking management)
- [ ] `card_flags` table (for flag now, fix later)

**Files to create**:
- `migrations/changesets/002-fsrs-core-schema.xml`

**Key Fields**:
```sql
cards:
  - stability DECIMAL(10,2)
  - difficulty DECIMAL(4,2)
  - last_review TIMESTAMP
  - next_review TIMESTAMP (indexed!)
```

### 1.2 Indexes & Constraints

- [ ] Index on `cards.next_review` (for due cards queries)
- [ ] Index on `cards.user_id, cards.deck_id`
- [ ] Index on `review_logs.user_id, review_logs.review_date`
- [ ] Foreign key constraints

### 1.3 Test Data

- [ ] Seed script for development
- [ ] Sample decks and cards

**Deliverable**: Database schema ready, migrations run successfully

---

## Phase 2: Backend Foundation (Week 1, Days 3-5)

### 2.1 Project Setup

**Priority: CRITICAL**

- [ ] Initialize backend with Express + TypeScript
- [ ] Set up project structure:
  ```
  backend/
  ├── src/
  │   ├── index.ts
  │   ├── config/
  │   ├── services/
  │   │   └── fsrs.service.ts
  │   ├── models/
  │   ├── routes/
  │   ├── controllers/
  │   ├── middleware/
  │   └── utils/
  ├── package.json
  ├── tsconfig.json
  └── Dockerfile
  ```

- [ ] Install dependencies:
  ```bash
  yarn add express cors helmet morgan dotenv pg zod
  yarn add -D typescript @types/node @types/express @types/cors @types/pg tsx nodemon
  ```

### 2.2 Database Connection

- [ ] Set up PostgreSQL connection pool
- [ ] Create database utility functions
- [ ] Add connection health check

### 2.3 Environment Configuration

- [ ] Create `.env`
- [ ] Set up environment variables:
  - Database connection
  - JWT secrets
  - Port configuration

**Deliverable**: Backend server running, database connected

---

## Phase 3: FSRS Service Integration (Week 1, Day 5 - Week 2, Day 2)

### 3.1 Copy FSRS Implementation

**Priority: CRITICAL**

- [ ] Copy `private/docs/FSRS_IMPLEMENTATION.ts` to `backend/src/services/fsrs.service.ts`
- [ ] Verify TypeScript compilation
- [ ] Add unit tests for core FSRS functions

### 3.2 Database Models

- [ ] Create TypeScript interfaces matching database schema
- [ ] Create model classes for:
  - `Card` (with FSRS state)
  - `Deck`
  - `ReviewLog`
  - `UserSettings`

### 3.3 FSRS Service Wrapper

- [ ] Create `FSRSService` class that:
  - Wraps FSRS algorithm
  - Handles database persistence
  - Provides helper methods

**Example structure**:
```typescript
class FSRSService {
  private fsrs: FSRS;
  
  async reviewCard(cardId: string, rating: Rating): Promise<ReviewResult>
  async getDueCards(deckId: string): Promise<Card[]>
  async calculateRisk(cardId: string): Promise<ManagementRisk>
  // ...
}
```

**Deliverable**: FSRS service integrated, can review cards

---

## Phase 4: API Endpoints (Week 2, Days 3-5)

### 4.1 Authentication

**Priority: HIGH**

- [ ] User registration endpoint
- [ ] User login endpoint (JWT)
- [ ] Auth middleware
- [ ] User profile endpoints

### 4.2 Deck Endpoints

**Priority: HIGH**

- [ ] `GET /api/decks` - List user decks
- [ ] `POST /api/decks` - Create deck
- [ ] `GET /api/decks/:id` - Get deck details
- [ ] `PUT /api/decks/:id` - Update deck
- [ ] `DELETE /api/decks/:id` - Delete deck
- [ ] `GET /api/decks/:id/risk` - Get management risk

### 4.3 Card Endpoints

**Priority: CRITICAL**

- [ ] `GET /api/decks/:deckId/cards` - List cards in deck
- [ ] `POST /api/decks/:deckId/cards` - Create card
- [ ] `GET /api/cards/:id` - Get card details
- [ ] `PUT /api/cards/:id` - Update card
- [ ] `DELETE /api/cards/:id` - Delete card
- [ ] `POST /api/cards/:id/review` - Review card (FSRS update)
- [ ] `GET /api/cards/:id/risk` - Get card risk

### 4.4 Review Session Endpoints

**Priority: CRITICAL**

- [ ] `GET /api/decks/:id/cards/due` - Get due cards
- [ ] `GET /api/decks/:id/cards/pre-study` - Get pre-study cards
- [ ] `GET /api/decks/:id/cards/cram` - Get cram mode cards
- [ ] `POST /api/reviews/batch` - Batch review multiple cards

### 4.5 Management Endpoints

**Priority: MEDIUM**

- [ ] `POST /api/cards/:id/management-view` - Track management view
- [ ] `POST /api/cards/:id/flag` - Flag card during study
- [ ] `GET /api/cards/flags` - Get flagged cards
- [ ] `POST /api/cards/:id/reset-stability` - Reset card stability

### 4.6 Statistics Endpoints

**Priority: LOW**

- [ ] `GET /api/decks/:id/statistics` - Deck statistics
- [ ] `GET /api/users/statistics` - User statistics

**Deliverable**: All API endpoints implemented and tested

---

## Phase 5: Frontend Foundation (Week 3, Days 1-3)

### 5.1 Project Setup

**Priority: CRITICAL**

- [ ] Initialize Next.js with TypeScript
- [ ] Set up Tailwind CSS
- [ ] Configure project structure:
  ```
  frontend/
  ├── src/
  │   ├── app/          # Next.js app router
  │   ├── components/
  │   ├── lib/          # API client, utilities
  │   ├── hooks/        # React hooks
  │   ├── types/        # TypeScript types
  │   └── styles/
  ├── package.json
  ├── tsconfig.json
  └── tailwind.config.js
  ```

- [ ] Install dependencies:
  ```bash
  yarn add axios zod react-query
  yarn add -D @types/react @types/react-dom
  ```

### 5.2 API Client

- [ ] Create API client with axios
- [ ] Set up React Query for data fetching
- [ ] Create typed API functions

### 5.3 Authentication

- [ ] Login page
- [ ] Registration page
- [ ] Auth context/provider
- [ ] Protected route wrapper

**Deliverable**: Frontend foundation ready, can authenticate

---

## Phase 6: Core UI Components (Week 3, Days 4-5)

### 6.1 Layout Components

**Priority: HIGH**

- [ ] Main layout with navigation
- [ ] Sidebar for deck navigation
- [ ] Header with user menu

### 6.2 Deck Management

**Priority: HIGH**

- [ ] Deck list page
- [ ] Deck creation form
- [ ] Deck detail page
- [ ] Risk warning modal (before managing)

### 6.3 Card Management

**Priority: HIGH**

- [ ] Card list (masked by default)
- [ ] Card creation/edit form
- [ ] Masked editor (blurred answer)
- [ ] Flag card component

**Deliverable**: Can create and manage decks/cards

---

## Phase 7: Review Interface (Week 4, Days 1-4)

### 7.1 Review Session

**Priority: CRITICAL**

- [ ] Review page layout
- [ ] Card display component
- [ ] Rating buttons (Again, Hard, Good, Easy)
- [ ] Card hider overlay
- [ ] Progress indicator
- [ ] Session statistics

### 7.2 Review Flow

- [ ] Get due cards
- [ ] Display card (recto first)
- [ ] Reveal answer (verso)
- [ ] User rates card
- [ ] Update FSRS state
- [ ] Show next card
- [ ] Session completion screen

### 7.3 Pre-Study Mode

**Priority: MEDIUM**

- [ ] Pre-study button on deck page
- [ ] Pre-study session (95% retention)
- [ ] Risk reduction feedback

### 7.4 Cram Mode

**Priority: LOW**

- [ ] Cram mode toggle
- [ ] Risk-based card sorting
- [ ] Risk zones display (Critical/Optimal/Safe)

**Deliverable**: Full review experience working

---

## Phase 8: Advanced Features (Week 4, Days 5 - Week 5)

### 8.1 Statistics Dashboard

**Priority: MEDIUM**

- [ ] Deck statistics page
- [ ] Cards due today/this week
- [ ] Success rate charts
- [ ] Study streak tracking

### 8.2 Management Risk Features

**Priority: MEDIUM**

- [ ] Risk warning before managing
- [ ] Risk breakdown display
- [ ] Pre-study recommendation
- [ ] Management view tracking

### 8.3 Content Change Detection

**Priority: MEDIUM**

- [ ] Auto-detect content changes
- [ ] Reset stability dialog
- [ ] Change percentage display

### 8.4 Flag System

**Priority: LOW**

- [ ] Flag button during review
- [ ] Flagged cards list
- [ ] Resolve flags

**Deliverable**: Advanced features implemented

---

## Phase 9: Testing & Polish (Week 5-6)

### 9.1 Unit Tests

- [ ] FSRS algorithm tests
- [ ] Service layer tests
- [ ] API endpoint tests

### 9.2 Integration Tests

- [ ] Review flow end-to-end
- [ ] Management flow end-to-end
- [ ] Risk assessment flow

### 9.3 UI/UX Polish

- [ ] Error handling
- [ ] Loading states
- [ ] Responsive design
- [ ] Accessibility
- [ ] Dark mode (optional)

### 9.4 Performance

- [ ] Database query optimization
- [ ] Frontend bundle optimization
- [ ] Caching strategy

**Deliverable**: Production-ready application

---

## Phase 10: Deployment (Week 6)

### 10.1 Production Setup

- [ ] Environment variables
- [ ] Database migrations
- [ ] Docker configuration
- [ ] CI/CD pipeline

### 10.2 Monitoring

- [ ] Error tracking
- [ ] Performance monitoring
- [ ] Analytics

**Deliverable**: Application deployed and monitored

---

## Implementation Order Summary

### Week 1: Foundation
1. Database schema ✅
2. Backend setup ✅
3. FSRS service ✅

### Week 2: Backend API
4. API endpoints ✅
5. Testing backend ✅

### Week 3: Frontend Foundation
6. Frontend setup ✅
7. Core UI ✅

### Week 4: Review System
8. Review interface ✅
9. Advanced features ✅

### Week 5-6: Polish & Deploy
10. Testing ✅
11. Polish ✅
12. Deploy ✅

---

## Quick Start Checklist

**Before starting, ensure**:
- [ ] PostgreSQL 17+ installed/running
- [ ] Node.js 22+ installed
- [ ] Yarn 4.9.2+ installed
- [ ] Docker & Docker Compose (optional)

**First steps**:
1. Set up database schema (Phase 1)
2. Initialize backend (Phase 2)
3. Copy FSRS service (Phase 3)
4. Create first API endpoint (Phase 4)
5. Test with Postman/curl

---

## Key Decisions Needed

1. **Authentication**: JWT? OAuth? Simple email/password?
2. **File Storage**: Where to store card images? (S3, local, etc.)
3. **Real-time**: Need WebSockets for live updates?
4. **Mobile**: PWA or native app later?

---

## Next Steps

1. Review this plan
2. Adjust priorities if needed
3. Start with Phase 1 (Database Schema)
4. Create GitHub issues/tasks for tracking

Let's start with Phase 1! 🚀
