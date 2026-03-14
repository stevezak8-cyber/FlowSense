import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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

// API routes (aligned to FlowSense modules)
app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/technicians", techniciansRouter);
app.use("/api/customers", customersRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/conversations", conversationsRouter);

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
