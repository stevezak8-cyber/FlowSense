import { prisma } from "../lib/prisma.js";

/**
 * Marks invoices as "overdue" if they are still "pending" and past their dueDate.
 * Runs once on startup and then every hour.
 */
async function markOverdueInvoices() {
  try {
    const result = await prisma.invoice.updateMany({
      where: {
        status: "pending",
        dueDate: { lt: new Date() },
      },
      data: { status: "overdue" },
    });
    if (result.count > 0) {
      console.log(`[scheduler] Marked ${result.count} invoice(s) as overdue`);
    }
  } catch (e) {
    console.error("[scheduler] Failed to mark overdue invoices:", e instanceof Error ? e.message : e);
  }
}

const ONE_HOUR = 60 * 60 * 1000;

export function startInvoiceScheduler() {
  // Run immediately on startup to catch anything that went overdue overnight
  markOverdueInvoices();
  // Then re-run every hour
  setInterval(markOverdueInvoices, ONE_HOUR);
  console.log("[scheduler] Invoice overdue checker started (runs every hour)");
}
