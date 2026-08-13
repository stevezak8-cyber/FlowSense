# FlowSense

**Operating system for HVAC businesses.** FlowSense unifies customer engagement, field execution, and office operations through HVAC-specific AI, compliance-driven workflows, and a compounding data intelligence layer.

- **Primary market:** Small to mid-sized HVAC (1–25 trucks)  
- **MVP focus:** Technician AI co-pilot, auto job documentation, pre-arrival intelligence, compliance logging  

## Repo structure

```
flowsense/
├── backend/     # Node, Express, TypeScript, Prisma (PostgreSQL)
├── frontend/    # React, Vite, TypeScript
├── package.json
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** (local or hosted)
- **npm** (or pnpm/yarn)

## Quick start

### 1. Install dependencies

From the repo root:

```bash
npm run install:all
```

Or manually:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. Backend: database and env

```bash
cd backend
cp .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection string, e.g.:
# DATABASE_URL="postgresql://user:password@localhost:5432/flowsense?schema=public"
```

Create DB and schema:

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 3. Run backend and frontend

From repo root:

```bash
npm run dev
```

This starts:

- **API:** http://localhost:4000  
- **Frontend:** http://localhost:5173 (proxies `/api` and `/health` to the API)

Or run separately:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

## Backend

- **Stack:** Express, TypeScript, Prisma, PostgreSQL, Zod  
- **Scripts:** `npm run dev` | `build` | `start` | `db:generate` | `db:push` | `db:migrate` | `db:seed`  
- **API surface (MVP):**
  - `GET/POST /api/jobs`, `GET/PATCH /api/jobs/:id`
  - `GET/POST /api/technicians`, `GET/PATCH /api/technicians/:id`
  - `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`
  - `GET /api/compliance/job/:jobId`, `POST /api/compliance`
  - `GET /health`

Auth and organization scoping are placeholders (single default org for MVP).

## Frontend

- **Stack:** React 18, Vite, TypeScript, React Router  
- **Scripts:** `npm run dev` | `build` | `preview`  
- **Pages:** Dashboard, Jobs, Job detail (with pre-arrival intel & compliance), Technicians, Customers  

## Platform pillars (from product definition)

| Pillar | MVP coverage |
|--------|----------------|
| **Customers** | Customer CRUD, job linkage; AI concierge / scheduling deferred |
| **Technicians** | Technician CRUD, job assignment, EPA 608 field; AI co-pilot & voice-to-report deferred |
| **Office** | Jobs list/detail, dispatch placeholder; smart dispatch & inventory deferred |
| **Compliance** | Compliance log model and API; EPA 608 prompts and audit UI deferred |
| **Data & intelligence** | Structured data in DB; predictive analytics and flywheel deferred |

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for local Postgres)

### Setup

```bash
# Install dependencies
npm install --prefix backend
npm install --prefix frontend

# Start Postgres
docker-compose up -d

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and JWT_SECRET at minimum

# Run migrations and seed demo data
cd backend && npx prisma migrate deploy && npx prisma db seed

# Start dev servers (two terminals)
cd backend && npm run dev        # API on :4000
cd frontend && npm run dev       # UI on :5173
```

Demo accounts created by the seed:

| Role | Email | Password |
|------|-------|----------|
| Office | office@flowsense.demo | office123 |
| Technician | tech@flowsense.demo | tech123 |
| Customer | customer@flowsense.demo | customer123 |

---

## Deploying to Railway

1. Create a Railway project, add a **PostgreSQL** service, then add a service pointing to this repo.
2. Railway detects `railway.toml` and builds via `Dockerfile` automatically.
3. Link the Postgres service so `DATABASE_URL` is injected automatically.
4. Set the required environment variables in Railway → Variables:

| Variable | Notes |
|----------|-------|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | `production` |

Optional variables (features degrade gracefully if not set):

| Variable | Feature |
|----------|---------|
| `RESEND_API_KEY` | Email notifications |
| `FROM_EMAIL` | Sender address e.g. `FlowSense <noreply@yourdomain.com>` |
| `ANTHROPIC_API_KEY` | AI job briefings and summaries |
| `GOOGLE_MAPS_API_KEY` | Drive-time estimates in dispatch |
| `STRIPE_SECRET_KEY` | Online invoice payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `APP_URL` | Your production URL (for Stripe redirects) |

Migrations run automatically on each deploy via the `releaseCommand` in `railway.toml`.

**First deploy:** visit `https://your-app.up.railway.app/register` to create your organization and admin account.

### Stripe webhook (production)

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-app.up.railway.app/webhooks/stripe`
3. Event: `checkout.session.completed`
4. Copy the signing secret → add as `STRIPE_WEBHOOK_SECRET` in Railway

For local Stripe testing: `stripe listen --forward-to localhost:4000/webhooks/stripe`

---

## License

Proprietary.
