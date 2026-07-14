# AI Pricebook + Smart Estimates — Design Spec

**Date:** 2026-07-13
**Status:** Approved

---

## Overview

FlowSense will add an AI-powered estimate system that lets technicians create professional Good/Better/Best proposals in the field without manually building them from scratch. The AI generates a draft from the job context and pricebook catalog; the technician reviews and adjusts; the customer approves on-device or via a portal link with a digital signature and optional deposit.

This feature directly targets the #1 gap versus ServiceTitan: the absence of a structured estimate flow. The AI-first approach is the differentiator — ServiceTitan requires techs to browse a catalog and build estimates manually. FlowSense starts with an intelligent draft.

---

## Approach

**B + C hybrid:**

- **B (Pricebook-first):** A full catalog UI in admin Settings. Admins manage services, parts, and labor rates. Techs can browse the catalog to add or swap items on an estimate.
- **C (AI drafts, catalog enforces):** When a tech creates an estimate, AI reads the job's symptom summary, equipment type, and equipment age, then pre-fills Good/Better/Best tiers from the pricebook. The pricebook sets price floors and locked items — the AI and admin use it as infrastructure, not the tech.

---

## Pricebook

### Ownership and Permissions

| Actor | Can do |
|-------|--------|
| Admin | Create, edit, delete any item; lock items; set deposit threshold |
| Technician | Browse catalog; add unlocked items to an estimate; adjust quantities |
| AI | Seed catalog on signup; suggest line items when generating estimates |

**Locking:** Admins can lock individual pricebook items. Locked items appear on AI-generated estimates with a lock icon and cannot be edited or removed by technicians. Intended for big-ticket items (equipment replacements, full installs) where price accuracy is critical.

**Deposit threshold:** Admin sets a dollar amount (default $500). When an estimate total exceeds this, the customer approval flow prompts for an optional deposit. The deposit is always skippable.

### AI Seeding on Signup

When a new organization is created, a background job calls Claude to generate a starter pricebook of ~40 common HVAC services with industry-standard price ranges. Items are tagged `source: "ai"`. Admin can edit or delete any seeded item.

Seeded categories:
- Cooling (refrigerant recharge, capacitor replacement, coil cleaning, fan motor, compressor)
- Heating (heat exchanger, igniter, flame sensor, gas valve, blower motor)
- Parts (refrigerants, capacitors, contactors, filters, belts)
- Labor (diagnostic fee, after-hours rate, travel fee)
- Maintenance (AC tune-up, furnace tune-up, full system inspection)

### Pricebook Data Model

```prisma
model PricebookItem {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  description    String?
  category       String   // cooling | heating | parts | labor | maintenance
  unit           String?  // e.g. "per lb", "each", "per hour"
  priceGood      Float
  priceBetter    Float?   // null = not included in Better tier by default
  priceBest      Float?   // null = not included in Best tier by default
  locked         Boolean  @default(false)
  source         String   @default("admin") // "admin" | "ai"
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
}
```

### Pricebook UI (Admin Settings)

Location: `Settings → Pricebook` tab (new tab in `OfficeSettings.tsx` or dedicated page at `/office/settings/pricebook`).

Features:
- Category filter tabs (All / Cooling / Heating / Parts / Labor / Maintenance)
- Search by name
- Table with columns: Name, Category, Good price, Better price, Best price, Locked toggle, Edit button
- "AI suggested" badge on seeded items
- Locked items have an amber highlight row
- "+ Add Item" opens a dialog
- "Import CSV" for bulk import
- Footer shows deposit threshold (editable inline)

---

## Estimate System

### Data Model

```prisma
model Estimate {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  jobId          String
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status         String   @default("draft") // draft | sent | approved | declined | expired
  selectedTier   String?  // good | better | best
  signatureData  String?  // base64 SVG or typed name
  signedAt       DateTime?
  depositAmount  Float?
  depositPaidAt  DateTime?
  stripePaymentIntentId String?
  sentAt         DateTime?
  approvedAt     DateTime?
  expiresAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lines          EstimateLine[]

  @@index([jobId])
  @@index([organizationId])
}

model EstimateLine {
  id              String   @id @default(cuid())
  estimateId      String
  estimate        Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)
  pricebookItemId String?  // null for manually typed lines
  pricebookItem   PricebookItem? @relation(fields: [pricebookItemId], references: [id])
  tier            String   // good | better | best
  name            String
  quantity        Float    @default(1)
  unitPrice       Float
  locked          Boolean  @default(false)
  source          String   @default("manual") // "ai" | "manual"
}
```

### AI Generation

**Endpoint:** `POST /api/estimates/generate`

**Input:** `jobId`

**Process:**
1. Load job with `symptomSummary`, `equipmentType`, `equipmentNotes`, and customer's job history
2. Load org pricebook items (active only)
3. Call Claude with a structured prompt:
   - System: role as HVAC estimating assistant, given pricebook as JSON
   - User: job context (symptom, equipment type, age inferred from history)
   - Output: JSON with `good`, `better`, `best` arrays of `{ pricebookItemId, quantity, tier }` 
4. AI uses **scope logic** for repairs (more items per tier) and **parts quality logic** for replacements (same repair, different part grade)
5. Return draft `Estimate` with lines populated

**Tier differentiation logic (AI decides per job type):**
- **Repairs** (refrigerant, leak, electrical faults): Good = fix now. Better = fix + address related wear items. Best = fix + full tune-up.
- **Replacements** (motors, compressors, coils): Good = OEM-equivalent part, 90-day warranty. Better = OEM part, 1-year warranty. Best = premium part + 2-year warranty + priority service.

### Estimate Builder (Technician View)

Location: Button on each job card in `TechnicianJobs.tsx` — "Create Estimate" appears when job status is `scheduled`, `en_route`, or `in_progress`.

Flow:
1. Tech taps "Create Estimate" → loading spinner while AI generates
2. Estimate builder opens with three tabs (Good / Better / Best)
3. Each tab shows line items with name and price
4. AI-suggested items have a ✨ badge; locked items have a 🔒 badge
5. Tech can add items via "+ Add from catalog" (searchable pricebook drawer)
6. Tech can remove unlocked AI-suggested items
7. Tech cannot edit price of locked items
8. Totals update live
9. Bottom: "Present to Customer" and "Send Link" buttons

### Customer Presentation Mode

**On-device:** "Present to Customer" enters a full-screen mode showing Good/Better/Best cards side by side (or stacked on small screens). "Most Popular" badge defaults to Better tier. Customer taps a tier → proceeds to signature screen.

**Portal link:** "Send Link" emails the customer a unique URL to `/customer/estimates/:token`. Same Good/Better/Best UI but web-based. Estimate expires in 48 hours (configurable). Status updates to `sent`.

### Customer Approval Flow

1. Customer selects a tier
2. Signature screen:
   - On-device: finger-draw canvas (SVG capture)
   - Portal: typed full name as legal signature
3. If estimate total exceeds deposit threshold:
   - Deposit prompt appears (25% of selected tier total, rounded to nearest dollar)
   - Two buttons: "Pay Deposit" (Stripe) and "Skip for now"
   - Deposit is always optional
4. Customer taps "Approve & Begin Work"
5. Estimate status → `approved`, `selectedTier` set, `signedAt` recorded
6. Job status auto-updates to `in_progress` (or `scheduled` if work hasn't started)
7. Invoice is pre-filled with the approved tier's line items

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/pricebook` | office | List all active pricebook items |
| POST | `/api/pricebook` | admin | Create item |
| PATCH | `/api/pricebook/:id` | admin | Update item |
| DELETE | `/api/pricebook/:id` | admin | Soft-delete (set active: false) |
| POST | `/api/estimates/generate` | technician | AI-generate estimate for a job |
| GET | `/api/estimates/:id` | office + tech | Get estimate with lines |
| PATCH | `/api/estimates/:id` | tech | Update lines (add/remove unlocked) |
| POST | `/api/estimates/:id/send` | tech | Email portal link to customer |
| POST | `/api/estimates/:id/approve` | customer (token) | Record signature + tier selection |
| POST | `/api/estimates/:id/deposit` | customer (token) | Create Stripe payment intent for deposit |
| GET | `/api/estimates/token/:token` | public | Load estimate for customer portal |

---

## Frontend File Structure

```
frontend/src/
  pages/
    office/
      OfficeSettings.tsx              ← add Pricebook tab
    technician/
      TechnicianJobs.tsx              ← add "Create Estimate" button per job
    customer/
      CustomerEstimate.tsx            ← new: public estimate approval page
  components/
    estimates/
      estimate-builder.tsx            ← new: tech estimate builder
      estimate-tiers.tsx              ← new: Good/Better/Best presentation view
      estimate-approval.tsx           ← new: signature + deposit step
      catalog-drawer.tsx              ← new: searchable pricebook item picker
    pricebook/
      pricebook-table.tsx             ← new: admin catalog management table
      pricebook-item-dialog.tsx       ← new: add/edit item dialog
  api/
    types.ts                          ← add PricebookItem, Estimate, EstimateLine types
```

---

## Backend File Structure

```
backend/src/
  routes/
    pricebook.ts                      ← new: CRUD for pricebook items
    estimates.ts                      ← new: generate, approve, deposit endpoints
  services/
    estimate-ai.ts                    ← new: Claude call for AI generation + seeding
  prisma/
    schema.prisma                     ← add PricebookItem, Estimate, EstimateLine models
    migrations/                       ← new migration
```

---

## Error Handling

- **AI generation fails:** Show error toast, fall back to blank estimate builder with empty lines. Tech can build manually from catalog.
- **Customer portal link expired:** Show "This estimate has expired — please contact us to request a new one."
- **Deposit payment fails:** Customer can retry or skip deposit and approve without it.
- **Pricebook empty on estimate generation:** AI generates estimate with generic HVAC line items and a warning: "Your pricebook is empty — prices below are AI-estimated. Update your pricebook in Settings for accurate quotes."

---

## Out of Scope

- Multi-revision estimates (v1, v2 history)
- Estimate analytics (close rate by tier, average ticket)
- Financing options (Wisetack integration)
- Photo attachments on estimates
- Estimate templates (save and reuse)
- Customer counter-offers or negotiation
- Tax calculation
