import "dotenv/config";

// ── Startup environment validation ────────────────────────────────────────────
// Fail fast with a clear message rather than mysterious runtime errors.
const REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET"] as const;
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `\n[FlowSense] Missing required environment variables:\n` +
    missing.map((v) => `  ✗ ${v}`).join("\n") +
    `\n\nCopy backend/.env.example to backend/.env and fill in the values.\n`
  );
  process.exit(1);
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import rateLimit from "express-rate-limit";
import { requireAuth } from "./middleware/auth.js";
import { requireSubscription } from "./middleware/require-subscription.js";
import "./middleware/types.js";
import { healthRouter } from "./routes/health.js";
import { jobsRouter } from "./routes/jobs.js";
import { techniciansRouter } from "./routes/technicians.js";
import { customersRouter } from "./routes/customers.js";
import { complianceRouter } from "./routes/compliance.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { invoicesRouter } from "./routes/invoices.js";
import { conversationsRouter } from "./routes/conversations.js";
import { dispatchRouter } from "./routes/dispatch.js";
import { authRouter } from "./routes/auth.js";
import { organizationsRouter } from "./routes/organizations.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { billingRouter, billingConnectCallbackHandler } from "./routes/billing.js"
import { twilioWebhookRouter } from "./routes/twilio-webhook.js"
import { onboardingRouter } from "./routes/onboarding.js";
import { pricebookRouter } from "./routes/pricebook.js";
import { estimatesRouter, publicEstimatesRouter } from "./routes/estimates.js";
import { pushRouter } from "./routes/push.js"
import { aiRouter } from "./routes/ai.js";
import { equipmentRouter } from "./routes/equipment.js";
import { searchRouter } from "./routes/search.js"
import { recurringJobsRouter } from "./routes/recurring-jobs.js";
import { maintenancePlansRouter } from "./routes/maintenance-plans.js"
import { voiceRouter } from "./routes/voice.js"
import { conciergeRouter } from "./routes/concierge.js"
import { setupWebSocket } from "./services/notifications.js";
import { startInvoiceScheduler } from "./services/invoice-scheduler.js";
import cron from "node-cron";
import { spawnDueJobs } from "./services/recurring-jobs.js"
import { runReminderSchedule } from "./services/reminder-scheduler.js";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(helmet());
// In production Express serves the frontend directly — no cross-origin requests needed.
// In development Vite (localhost:5173) proxies /api, so we allow that origin.
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173", credentials: true }));
}

// Stripe webhook must receive the raw body for signature verification —
// register it BEFORE express.json() parses everything into objects.
app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRouter);

app.use(express.json());

// Rate limiting
// Auth routes: tight limit to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many requests — please try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});
// General API: generous limit to allow normal app use
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: "Too many requests — please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes (no auth required)
app.use("/health", healthRouter);
app.use("/api/auth", authLimiter, authRouter);

// Public Stripe Connect callback — no auth (Stripe browser redirect from OAuth)
app.use("/api/billing/connect/callback", apiLimiter, billingConnectCallbackHandler)

// Public Twilio webhook — no auth (Twilio server-to-server callback)
app.use("/api/webhooks/twilio", apiLimiter, express.urlencoded({ extended: false }), twilioWebhookRouter)

// Billing routes (auth required, no subscription check — these manage the subscription itself)
app.use("/api/billing", apiLimiter, requireAuth, billingRouter);
app.use("/api/admin/billing", apiLimiter, requireAuth, billingRouter);

// Protected routes (auth + subscription check + general rate limit)
app.use("/api/jobs", apiLimiter, requireAuth, requireSubscription, jobsRouter);
app.use("/api/technicians", apiLimiter, requireAuth, requireSubscription, techniciansRouter);
app.use("/api/customers", apiLimiter, requireAuth, requireSubscription, customersRouter);
app.use("/api/compliance", apiLimiter, requireAuth, requireSubscription, complianceRouter);
app.use("/api/dashboard", apiLimiter, requireAuth, requireSubscription, dashboardRouter);
app.use("/api/invoices", apiLimiter, requireAuth, requireSubscription, invoicesRouter);
app.use("/api/conversations", apiLimiter, requireAuth, requireSubscription, conversationsRouter);
app.use("/api/dispatch", apiLimiter, requireAuth, requireSubscription, dispatchRouter);
app.use("/api/organizations", apiLimiter, requireAuth, requireSubscription, organizationsRouter);
app.use("/api/onboarding", apiLimiter, requireAuth, requireSubscription, onboardingRouter);
app.use("/api/pricebook", apiLimiter, requireAuth, requireSubscription, pricebookRouter);

// Public — no auth required (token is authorization)
app.use("/api/estimates/token", apiLimiter, publicEstimatesRouter);

// Auth-protected estimates
app.use("/api/estimates", apiLimiter, requireAuth, requireSubscription, estimatesRouter);

app.use("/api/push", apiLimiter, requireAuth, pushRouter);
app.use("/api/ai", apiLimiter, requireAuth, requireSubscription, aiRouter);
app.use("/api/concierge", apiLimiter, requireAuth, requireSubscription, conciergeRouter);
app.use("/api/equipment", apiLimiter, requireAuth, requireSubscription, equipmentRouter);
app.use("/api/search", apiLimiter, requireAuth, requireSubscription, searchRouter);
app.use("/api/recurring-jobs", apiLimiter, requireAuth, requireSubscription, recurringJobsRouter);
app.use("/api/maintenance-plans", apiLimiter, requireAuth, requireSubscription, maintenancePlansRouter)
app.use("/api/voice", apiLimiter, requireAuth, requireSubscription, voiceRouter)

// In production, serve the compiled frontend static build and handle SPA routing.
// In development, Vite proxies /api requests — this block is never reached.
if (process.env.NODE_ENV === "production") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Compiled backend lives at backend/dist/index.js
  // Frontend build lives at frontend/dist/ (two levels up, then into frontend/dist)
  const frontendDist = join(__dirname, "../../frontend/dist");

  app.use(express.static(frontendDist));

  // Catch-all: for any non-API route, send back index.html so React Router works
  app.get("*", (_req, res) => {
    res.sendFile(join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ name: "FlowSense API", version: "0.1.0", docs: "/health" });
  });
}

const server = app.listen(PORT, () => {
  console.log(`FlowSense API running at http://localhost:${PORT}`);
});

setupWebSocket(server);
startInvoiceScheduler();

cron.schedule("0 0 * * *", () => {
  spawnDueJobs().catch(console.error)
});

// Appointment reminders — every 15 minutes
cron.schedule("*/15 * * * *", () => {
  runReminderSchedule().catch((err) => console.error("[Reminders] Error:", err))
})
