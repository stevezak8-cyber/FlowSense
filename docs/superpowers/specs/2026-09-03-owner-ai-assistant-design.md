# Owner AI Assistant — Design Spec

**Date:** 2026-09-03
**Feature:** Enterprise-tier "Jarvis" assistant for the business owner
**Status:** Proposed

---

## Overview

A live, voice-first AI assistant for the owner/admin of an Enterprise-tier ($2,999/mo) organization. The owner talks to it like a real conversation — interruptible, low-latency, always-listening while the panel is open — and it can both answer questions grounded in the business's live data and take real actions (book/reschedule/cancel jobs, send emails, draft and publish ad campaigns) on the owner's behalf, always pausing for explicit confirmation before anything with real consequences happens.

This is the first feature in the codebase to actually enforce a plan gate (`Organization.plan`) — every other AI feature today is available to all plans.

**Core design principle (human-in-the-loop by default):** the assistant defaults to read-only. Every tool is explicitly tagged `read` or `write`. Read tools execute immediately. Write tools always stage a `PendingAction` and require explicit confirmation — spoken or tapped — before anything actually happens. This is non-negotiable for money-moving or customer-facing actions (ad spend, cancellations, outbound email/SMS).

---

## Feature Gating & Access

- **Plan gate:** restricted to the org's top tier. The Stripe billing spec's `plan` enum (`trial/entry/core/premium/cancelled`) has drifted from the landing page's current tier names (`Shop/Fleet/Enterprise`) — this needs reconciling before implementation. For this spec, the gate is `organization.plan === "enterprise"` (or whatever value the reconciled enum uses for the $2,999/mo tier).
- **Role gate:** stacked on top of the plan gate — `user.role === "admin"` only. Office staff without admin do not see the assistant, even on an Enterprise org.
- Middleware: `requireEnterprisePlan` (new) + existing `requireAuth`, applied to all `/api/owner-assistant/*` and `/api/ad-accounts/*` routes.

---

## Architecture

Mapped to a "JARVIS" layer model, useful as a shared vocabulary for this feature:

| Layer | This feature's implementation |
|---|---|
| **J**ob Runner | The existing FlowSense backend (Railway-hosted, always-on) — no new always-on infrastructure |
| **A**gent Harness | New orchestration layer: session management, tool registry, the HITL confirmation gate, proactive-event injection |
| **R**easoning Model | OpenAI Realtime API for the live voice envelope (listening/turn-taking/speaking); individual tools internally call Claude for content generation (ad copy, business narrative) — task-tiered without adding a hop to every turn |
| **V**irtual Connections | The tool schema: job CRUD, `email.ts`, `sms.ts`, `InventoryItem`, Google/Meta/Nextdoor Ads APIs |
| **I**nstructions & Memory | Org-specific system prompt (business data, same pattern as `concierge-ai.ts`) + persistent `AssistantMemory` |
| **S**kills, Schedules & Speech | Proactive trigger checker (cron-style, same pattern as `reminder-scheduler.ts`) + Realtime API's built-in STT/TTS |

### Why OpenAI Realtime API, not a stitched Whisper→Claude→TTS pipeline

The existing `voice-transcribe.ts` pattern (record → Whisper transcribe → process → synthesize) is turn-based with multi-second round trips and no mid-sentence interruption. The owner explicitly wants a live, always-listening, interruptible conversation — that requires a single duplex audio model, not four chained calls. OpenAI's Realtime API handles STT, reasoning, and TTS in one continuous stream. This is a new dependency, separate from the Whisper endpoint the app already uses for voice-to-report (which is unchanged by this feature).

### Session lifecycle

1. Owner opens the widget or `/office/assistant` page → frontend calls `POST /api/owner-assistant/session`.
2. Backend verifies plan + role, builds the system prompt (org data, today's date, `AssistantMemory.notes`, queued proactive briefing items) and the tool schema, requests an ephemeral client token from OpenAI's Realtime session endpoint, returns it to the frontend.
3. Frontend opens a WebRTC connection directly to OpenAI using that token. Mic audio streams up, speech/text streams down. The backend is never in the audio path — only in the tool-call path, to keep voice latency low.
4. Tool calls arrive over the WebRTC data channel → frontend forwards to `POST /api/owner-assistant/tools/:toolName` → backend executes (read) or stages (write) → result is fed back into the session so the model continues talking.
5. Session ends on panel close or idle timeout. Backend summarizes the transcript into durable facts/preferences via a Claude call and merges into `AssistantMemory.notes`.

---

## Tool Catalog & HITL Confirmation

**Read tools** — execute immediately, no confirmation:

| Tool | Source |
|---|---|
| `get_daily_schedule` | Jobs today/this week, statuses, technician assignments |
| `get_job_status(jobIdOrDescription)` | Status, technician, timing for one job |
| `get_business_health` | Reuses existing analytics service — revenue trend, forecast, at-risk customers, AI narrative |
| `get_inventory_status` | Stock levels vs. upcoming jobs' needed parts |
| `get_ad_performance` | Spend, clicks, leads per active campaign |

**Write tools** — always staged via `PendingAction`, never execute on first call:

| Tool | Effect |
|---|---|
| `book_job` / `reschedule_job` / `cancel_job` | Job CRUD |
| `send_email(to, subject, body)` | Via existing `email.ts` |
| `send_sms(to, body)` | Via existing `sms.ts` |
| `draft_ad_creative(platform, goal, budget)` | Claude-generated copy — content only, not itself a spend action, no confirmation needed |
| `publish_ad_campaign(platform, creative, budget, targeting)` | Highest-risk tool — real ad spend |

**Confirmation flow:**

1. A write tool call creates a `PendingAction` row and returns its details to the model, which states the proposed action back to the owner in its own words and asks for a yes/no.
2. The frontend renders a visible **action card** in the transcript (e.g. "Reschedule Chen job → Thursday 2pm — needs your OK") with Confirm/Cancel buttons — confirmation isn't voice-only, since a misheard "yeah" should never trigger a real ad spend.
3. Confirming (via the model calling `confirm_pending_action(id)`, parsed from a spoken yes, or the button) executes the real side effect; backend reports success/failure back into the session.
4. Unconfirmed actions expire after 10 minutes and are silently discarded.

---

## Proactive Updates & Briefings

A new interval-based checker (same pattern as `reminder-scheduler.ts`) evaluates, per org:
- a job running significantly past its typical duration for that service type
- a new at-risk customer flag (reuses existing analytics logic)
- an `InventoryItem` crossing its reorder threshold
- a failed invoice payment
- an ad campaign hitting a spend or performance milestone

**Delivery:**
- **Live session open:** backend pushes the event into the active Realtime session as a server-injected item — the assistant speaks up unprompted ("heads up, the Chen job is running 40 minutes over").
- **No session open:** the event queues as a briefing item. The next session open leads with a short briefing pulled from `get_daily_schedule` + `get_business_health` + queued items — "since you were last here: 2 jobs ran long, you're low on capacitors, one payment failed." Every session opens with this briefing, not just reactive Q&A.

---

## Memory

After each session, a Claude call summarizes it into durable facts/preferences (e.g. "always confirm ad spend over $50," "prefers afternoon reschedules") and merges them into a capped `AssistantMemory.notes` field (~4000 chars, pruned/summarized over time as it grows). Injected into every future session's system prompt — same pattern as the org-context system prompt in `concierge-ai.ts`, but persisted and evolving instead of rebuilt from scratch.

---

## Data Model

```prisma
model AssistantMemory {
  id             String       @id @default(cuid())
  organizationId String       @unique
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  notes          String       @default("")
  updatedAt      DateTime     @updatedAt
}

model AssistantSession {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  startedAt      DateTime     @default(now())
  endedAt        DateTime?
  transcript     Json         // [{ role, content, ts }]

  @@index([organizationId])
}

model PendingAction {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  sessionId      String
  toolName       String
  payload        Json
  status         String       @default("pending") // pending | confirmed | cancelled | expired | failed
  createdAt      DateTime     @default(now())
  expiresAt      DateTime
  executedAt     DateTime?
  result         Json?

  @@index([organizationId])
  @@index([status])
}

model InventoryItem {
  id                String       @id @default(cuid())
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name              String       // "R-410A refrigerant", "Dual-run capacitor 45/5"
  quantityOnHand    Int
  reorderThreshold  Int?
  unit              String       @default("unit")
  updatedAt         DateTime     @updatedAt

  @@index([organizationId])
}

model AdAccountConnection {
  id                 String       @id @default(cuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  platform           String       // "google" | "meta" | "nextdoor"
  externalAccountId  String
  accessToken        String       // encrypted at rest
  refreshToken       String?
  connectedByUserId  String
  connectedAt        DateTime     @default(now())

  @@unique([organizationId, platform])
}

model AdCampaign {
  id                 String       @id @default(cuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  platform           String
  externalCampaignId String?
  name               String
  headline           String
  body               String
  imagePrompt        String?
  budgetDailyCents   Int
  targeting          Json         // { radiusMiles, zipCodes, serviceType }
  status             String       @default("draft") // draft | pending_confirmation | active | paused | ended | failed
  createdByAssistant Boolean      @default(true)
  createdAt          DateTime     @default(now())

  @@index([organizationId])
}
```

**Additions to `Organization`:**
```prisma
maxDailySpendPerCampaignCents  Int?
maxMonthlySpendCents           Int?
```
Set by the owner in Settings — never adjustable by the assistant itself.

`InventoryItem` is manually maintained: office staff set/adjust quantities via a small inventory page (stock count, receiving). Job completion optionally matches `partsUsed` free text against inventory item names to decrement stock. No barcode scanning or supplier integration in this design.

---

## Ad Publishing Subsystem

**Connecting an account** happens on a normal Settings page, not inside the assistant — OAuth is a browser-redirect flow. "Connect Google Ads / Meta Ads / Nextdoor Ads" buttons, standard OAuth callback, tokens stored in `AdAccountConnection`. If the owner asks the assistant to publish on an unconnected platform, it says so and points them to Settings.

**Budget guardrails:** `publish_ad_campaign` validates the proposed budget against `maxDailySpendPerCampaignCents` / `maxMonthlySpendCents` *before* staging a `PendingAction`. Over-cap requests get a spoken "that's above your $50/day limit — want me to lower it, or raise the cap in Settings first?" — never a silent bypass.

**Platform abstraction:** one `AdPlatformClient` interface (`createCampaign`, `pauseCampaign`, `getPerformance`) with per-platform implementations (`google-ads.ts`, `meta-ads.ts`, `nextdoor-ads.ts`), so the assistant's tools stay platform-agnostic. Each platform requires the owner to already have a funded ad account with a payment method on file there — FlowSense creates and manages campaigns via their API, it does not handle ad billing itself.

**Flow:** `draft_ad_creative` (Claude-generated headline/body, iterable conversationally — "make it punchier," "mention the $99 tune-up") → owner reviews/adjusts → `publish_ad_campaign` runs the budget-cap check → stages a `PendingAction` with a full preview card (platform, budget, targeting, creative) → explicit confirm → real API call creates and activates the campaign → `AdCampaign` row persisted. Pausing/ending a campaign follows the same staged-confirmation pattern.

---

## UI/UX

**Two entry points, same underlying session component:**
- A floating orb/launcher on every office page, opens a slide-over panel.
- A dedicated `/office/assistant` page for longer sessions, more room for action cards, inventory snapshot, active campaigns.

**Visual states:** idle → listening (waveform while mic captures) → thinking (brief indicator during a tool call) → speaking (waveform during TTS playback) → error/reconnecting.

**Transcript:** text bubbles for both sides even in voice mode, so the owner can scroll back and read what was said. Action cards render inline wherever a write tool proposes something.

**Text fallback:** if mic access is denied, or the owner just prefers typing, text input is simply another way to send a turn into the same Realtime session — not a separate mode.

---

## Error Handling

Follows the codebase's existing silent-skip pattern for unconfigured AI (e.g. `ANTHROPIC_API_KEY` absence elsewhere):

- No `OPENAI_API_KEY` configured → the assistant entry point doesn't appear at all.
- WebRTC connection drops mid-session → "reconnecting…" state with auto-retry; a clear "connection lost, tap to restart" if it can't recover.
- A tool call fails (DB error, ad API error, slot no longer available) → relayed back into the live session as a normal function result, so the assistant explains it conversationally rather than the UI showing a raw error.
- `PendingAction` expires unconfirmed → silently discarded; if asked later, the assistant explains it timed out and offers to redo it.
- Ad token expired/revoked → tool returns a "reconnect Google Ads in Settings" error — never a silent failure on a spend action.

---

## Testing Strategy

- Business logic independent of the voice transport (booking/rescheduling validation, budget-cap enforcement, `PendingAction` lifecycle, inventory decrement matching, memory summarization) is unit-tested the normal way.
- Tool-schema and system-prompt construction get integration tests against a mocked Realtime session-creation call.
- The live voice conversation itself is not meaningfully unit-testable. Manual QA script covers: book/reschedule/cancel end-to-end with confirmation, a full ad-campaign flow (draft → confirm → publish) against **sandbox ad accounts only** (Google Ads and Meta both offer test/sandbox modes — never test against real spend), a proactive alert firing mid-session, and interrupting the assistant mid-sentence.

---

## Out of Scope / Future Phases

- Barcode/scanner-based inventory intake — this design is manual-entry only.
- Access for non-admin office roles.
- Ad platforms beyond Google/Meta/Nextdoor.
- A non-voice fallback pipeline if the Realtime API is degraded — for now, a connection failure surfaces a retry, not a secondary transport.
