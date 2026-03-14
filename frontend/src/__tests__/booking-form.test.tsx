import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";


// Mock the API client
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock react-router-dom (CustomerBook does not use it directly, but transitive deps may)
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import CustomerBook from "../pages/customer/CustomerBook";

describe("CustomerBook booking form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the booking form heading", () => {
    render(<CustomerBook />);
    expect(screen.getByText(/book a service/i)).toBeInTheDocument();
  });

  it("shows service type options on step 1", () => {
    render(<CustomerBook />);
    // All four service type cards are rendered on step 1
    expect(screen.getByText("Repair")).toBeInTheDocument();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Inspection")).toBeInTheDocument();
    expect(screen.getByText("Installation")).toBeInTheDocument();
  });

  it("has a Next button disabled until a service is selected", () => {
    render(<CustomerBook />);
    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeInTheDocument();
    expect(nextBtn).toBeDisabled();
  });

  it("enables Next button after selecting a service type", () => {
    render(<CustomerBook />);
    // Click the Repair card
    fireEvent.click(screen.getByText("Repair"));
    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it("advances to step 2 (date & time) after selecting a service and clicking Next", () => {
    render(<CustomerBook />);
    fireEvent.click(screen.getByText("Repair"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(
      screen.getByText(/choose your preferred date and time/i)
    ).toBeInTheDocument();
  });

  it("has equipment type label on step 2", () => {
    render(<CustomerBook />);
    // Navigate to step 2
    fireEvent.click(screen.getByText("Maintenance"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/equipment type/i)).toBeInTheDocument();
  });

  it("has priority label on step 2", () => {
    render(<CustomerBook />);
    // Navigate to step 2
    fireEvent.click(screen.getByText("Maintenance"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/priority/i)).toBeInTheDocument();
  });

  it("has a Confirm Booking submit button on step 3", () => {
    render(<CustomerBook />);
    // Step 1: select service and go next
    fireEvent.click(screen.getByText("Repair"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: fill in date and select a time slot then click Review
    const dateInputEl = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInputEl, { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByText("8:00 AM - 10:00 AM"));
    fireEvent.click(screen.getByRole("button", { name: /review/i }));

    // Step 3: confirm booking button should be present
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn).toBeInTheDocument();
  });
});
