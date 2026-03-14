import { describe, it, expect } from "vitest";
import { isValidTransition, getAllowedTransitions } from "../services/job-status.js";

describe("isValidTransition", () => {
  it("allows pending → scheduled", () => {
    expect(isValidTransition("pending", "scheduled")).toBe(true);
  });

  it("allows scheduled → en_route", () => {
    expect(isValidTransition("scheduled", "en_route")).toBe(true);
  });

  it("allows en_route → in_progress", () => {
    expect(isValidTransition("en_route", "in_progress")).toBe(true);
  });

  it("allows in_progress → completed", () => {
    expect(isValidTransition("in_progress", "completed")).toBe(true);
  });

  it("allows any status → cancelled", () => {
    expect(isValidTransition("pending", "cancelled")).toBe(true);
    expect(isValidTransition("scheduled", "cancelled")).toBe(true);
    expect(isValidTransition("en_route", "cancelled")).toBe(true);
    expect(isValidTransition("in_progress", "cancelled")).toBe(true);
  });

  it("rejects pending → completed (skipping steps)", () => {
    expect(isValidTransition("pending", "completed")).toBe(false);
  });

  it("rejects completed → any (terminal state)", () => {
    expect(isValidTransition("completed", "scheduled")).toBe(false);
    expect(isValidTransition("completed", "cancelled")).toBe(false);
  });

  it("rejects cancelled → any (terminal state)", () => {
    expect(isValidTransition("cancelled", "scheduled")).toBe(false);
  });

  it("rejects backwards transitions", () => {
    expect(isValidTransition("in_progress", "en_route")).toBe(false);
    expect(isValidTransition("en_route", "scheduled")).toBe(false);
  });
});

describe("getAllowedTransitions", () => {
  it("returns correct transitions for pending", () => {
    expect(getAllowedTransitions("pending")).toEqual(["scheduled", "cancelled"]);
  });

  it("returns empty array for completed", () => {
    expect(getAllowedTransitions("completed")).toEqual([]);
  });

  it("returns empty array for unknown status", () => {
    expect(getAllowedTransitions("unknown")).toEqual([]);
  });
});
