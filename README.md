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

## License

Proprietary.
