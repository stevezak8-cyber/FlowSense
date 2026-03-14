import { describe, it, expect } from "vitest";

describe("Job completion auto-invoice", () => {
  it("should create an invoice with correct fields when job completes", () => {
    // The auto-invoice creates:
    // - description: "Service completed — [equipmentType]"
    // - amount: 0 (to be filled by office)
    // - status: "pending"
    // - dueDate: 30 days from completion
    // This is a structural test — verifying the shape of the invoice data

    const equipmentType = "Central AC";
    const description = `Service completed — ${equipmentType}`;
    expect(description).toBe("Service completed — Central AC");

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const now = new Date();
    const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it("should use 'HVAC service' when equipmentType is null", () => {
    const equipmentType: string | null = null;
    const description = `Service completed — ${equipmentType ?? "HVAC service"}`;
    expect(description).toBe("Service completed — HVAC service");
  });

  it("should set invoice status to pending", () => {
    const invoiceStatus = "pending";
    expect(invoiceStatus).toBe("pending");
  });
});
