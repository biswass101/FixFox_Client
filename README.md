# FixFlow API

Enterprise AI-assisted facility maintenance and work order management SaaS backend. Built with Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, Redis, BullMQ, and OpenRouter AI.

---

## 1. System Architecture

```
                  ┌─────────────────────────────────────┐
                  │          Client Applications        │
                  │   (Next.js Web / Mobile Clients)   │
                  └──────────────────┬──────────────────┘
                                     │ HTTPS / Cookies
                                     ▼
                  ┌─────────────────────────────────────┐
                  │       FixFlow Express REST API      │
                  │  (Helmet, CORS, Rate Limit, Auth)   │
                  └──────────┬───────────────────┬──────┘
                             │                   │
         Prisma Client (ORM) │                   │ Enqueue Jobs
                             ▼                   ▼
                  ┌────────────────────┐   ┌────────────────────┐
                  │   PostgreSQL 16    │   │      Redis 7       │
                  │ (Multi-tenant DB)  │   │  (Sessions/Queues) │
                  └────────────────────┘   └─────────┬──────────┘
                                                     │ Dequeue
                                                     ▼
                                           ┌────────────────────┐
                                           │   BullMQ Workers   │
                                           │  - OpenRouter AI   │
                                           │  - Nodemailer      │
                                           │  - SLA Monitor     │
                                           │  - Recurring Fault │
                                           └────────────────────┘
```

---

## 2. Technology Stack

- **Runtime**: Node.js (>= 20.0.0), TypeScript 5.7 (Strict Mode)
- **Web Framework**: Express 4.21
- **Database**: PostgreSQL 16 managed via Prisma ORM 6
- **Caching & Queues**: Redis 7, BullMQ 5
- **AI Triage**: OpenRouter (`https://openrouter.ai/api/v1`) via OpenAI SDK with structured output validation
- **Authentication**: Argon2id password hashing, rotating session cookies, HS256 JWT access tokens
- **File Storage**: Cloudinary SDK for incident and resolution photos
- **Email Delivery**: Nodemailer with HTML templates for assignments, status changes, and SLA alerts
- **API Documentation**: OpenAPI 3.0 / Swagger UI at `/api/docs`
- **Testing**: Vitest, Supertest with live PostgreSQL and Redis integration suites

---

## 3. Getting Started

### Prerequisites

- Node.js >= 20.0.0
- Docker and Docker Compose

### 1. Start Infrastructure Containers

Start PostgreSQL and Redis in the background:

```bash
docker compose up -d
```

Verify services are healthy:
- PostgreSQL on `localhost:5432` (`fixflow_dev`)
- Redis on `localhost:6379`
- Redis Commander on `http://localhost:8081`

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Key environment variables:
- `DATABASE_URL`: `postgresql://fixflow:fixflow_dev@localhost:5432/fixflow_dev?schema=public`
- `REDIS_URL`: `redis://localhost:6379`
- `ACCESS_TOKEN_SECRET`: Random 32+ character secret
- `REFRESH_TOKEN_SECRET`: Random 32+ character secret
- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `OPENROUTER_MODEL`: `openai/gpt-4o-mini` (or any preferred model)

### 3. Database Synchronization & Seeding

Synchronize database schema:

```bash
npm run db:push
```

Seed initial demo data (Apex Facilities Group with Admin, Manager, Technicians, Reporter, locations, assets, and tickets):

```bash
npm run db:seed
```

Demo Credentials:
- **Admin**: `admin@apex.fixflow.app` / `Password123!`
- **Manager**: `manager@apex.fixflow.app` / `Password123!`
- **Lead HVAC Tech**: `tech.hvac@apex.fixflow.app` / `Password123!`
- **Electrical/Elevator Tech**: `tech.elec@apex.fixflow.app` / `Password123!`
- **Reporter**: `reporter@apex.fixflow.app` / `Password123!`

---

## 4. Running the Service

### Development Mode

Run the web API:

```bash
npm run dev
```

Run the background workers in a separate terminal:

```bash
npm run dev:worker
```

### Production Build

```bash
npm run build
npm start
```

---

## 5. API Reference & Swagger UI

Interactive Swagger documentation is available locally at:
- UI: `http://localhost:4000/api/docs`
- JSON Spec: `http://localhost:4000/api/docs/json`

### Core Endpoints Overview

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Tenant creation & admin registration | Public |
| `POST` | `/api/v1/auth/login` | User login & session creation | Public |
| `POST` | `/api/v1/auth/refresh` | Session token rotation | Public |
| `GET` | `/api/v1/auth/me` | Current authenticated user profile | Authenticated |
| `GET` | `/api/v1/locations` | List locations with search & pagination | Authenticated |
| `POST` | `/api/v1/locations` | Create location | Admin, Manager |
| `GET` | `/api/v1/assets` | List equipment & machinery assets | Authenticated |
| `POST` | `/api/v1/assets` | Register asset with location link | Admin, Manager |
| `GET` | `/api/v1/technicians` | Technicians with active workload | Admin, Manager |
| `GET` | `/api/v1/work-orders` | List work orders with filters & search | Authenticated |
| `POST` | `/api/v1/work-orders` | Submit new work order | Authenticated |
| `POST` | `/api/v1/work-orders/:id/assign` | Assign technician with reason | Admin, Manager |
| `POST` | `/api/v1/work-orders/:id/status` | Advance lifecycle status | Assignee, Manager, Admin |
| `POST` | `/api/v1/work-orders/:id/resolve` | Mark work order resolved | Assignee, Manager, Admin |
| `POST` | `/api/v1/work-orders/:id/close` | Formally close work order | Admin, Manager |
| `POST` | `/api/v1/work-orders/:id/notes` | Add public or internal work notes | Authenticated |
| `POST` | `/api/v1/work-orders/:id/costs` | Authoritative parts/labor costs | Assignee, Manager, Admin |
| `GET` | `/api/v1/work-orders/:id/ai-analysis` | Get AI classification & summary | Authenticated |
| `POST` | `/api/v1/work-orders/:id/ai-analysis/review`| Accept or override AI suggestion | Admin, Manager |
| `POST` | `/api/v1/work-orders/:id/images` | Upload Cloudinary incident image | Assignee, Reporter, Admin |
| `POST` | `/api/v1/invitations` | Invite team member via email | Admin, Manager |
| `POST` | `/api/v1/invitations/accept` | Accept invitation & activate account | Public |
| `GET` | `/api/v1/notifications` | User notifications with unread filter | Authenticated |
| `GET` | `/api/v1/analytics/overview` | KPI metrics, MTTR, and total costs | Authenticated |
| `GET` | `/api/v1/analytics/trends` | Rolling 30-day volume vs resolution | Authenticated |

---

## 6. Testing & Quality Assurance

```bash
# Run full unit and integration test suite
npm test

# Run tests with coverage
npm run test:coverage

# Run TypeScript compilation check
npm run typecheck

# Run linter check
npm run lint
```

---

## 7. Production Docker Deployment

Build and run the production image:

```bash
docker build -t fixflow-api .
docker run -p 4000:4000 --env-file .env fixflow-api
```

