import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./middleware/auth.js";
import "./middleware/types.js";
import { healthRouter } from "./routes/health.js";
import { jobsRouter } from "./routes/jobs.js";
import { techniciansRouter } from "./routes/technicians.js";
import { customersRouter } from "./routes/customers.js";
import { complianceRouter } from "./routes/compliance.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { invoicesRouter } from "./routes/invoices.js";
import { conversationsRouter } from "./routes/conversations.js";
import { authRouter } from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));
app.use(express.json());

// Public routes (no auth required)
app.use("/health", healthRouter);
app.use("/api/auth", authRouter);

// Protected routes (auth required)
app.use("/api/jobs", requireAuth, jobsRouter);
app.use("/api/technicians", requireAuth, techniciansRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/compliance", requireAuth, complianceRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/invoices", requireAuth, invoicesRouter);
app.use("/api/conversations", requireAuth, conversationsRouter);

app.get("/", (_req, res) => {
  res.json({
    name: "FlowSense API",
    version: "0.1.0",
    docs: "/health",
  });
});

app.listen(PORT, () => {
  console.log(`FlowSense API running at http://localhost:${PORT}`);
});
