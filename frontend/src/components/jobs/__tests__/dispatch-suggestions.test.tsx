import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DispatchSuggestions } from "../dispatch-suggestions"

// Mock the API client
vi.mock("@/api/client", () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { api } from "@/api/client"

const mockResult = {
  suggestions: [
    {
      technician: { id: "t1", name: "Jordan Smith", skills: ["furnace", "ac"], vehicle: { id: "v1", name: "Truck 1" } },
      score: 0.92,
      driveMinutes: 12,
      todayJobCount: 2,
      servedCustomerBefore: false,
      skillMatch: true,
    },
    {
      technician: { id: "t2", name: "Maria Garcia", skills: ["ac", "heat-pump"], vehicle: { id: "v2", name: "Van 2" } },
      score: 0.78,
      driveMinutes: 25,
      todayJobCount: 1,
      servedCustomerBefore: true,
      skillMatch: true,
    },
  ],
  fallbackMode: false,
  driveTimesAvailable: true,
}

const defaultProps = {
  equipmentType: "furnace",
  customerAddress: "123 Main St, Denver, CO 80202",
  scheduledAt: "2026-03-15T14:00:00.000Z",
  customerId: "cust-1",
  priority: "normal",
  selectedTechId: null,
  onSelect: vi.fn(),
  onSkip: vi.fn(),
  onError: vi.fn(),
}

describe("DispatchSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows placeholder when equipmentType is null", () => {
    render(<DispatchSuggestions {...defaultProps} equipmentType={null} />)
    expect(screen.getByText(/select equipment type/i)).toBeInTheDocument()
  })

  it("shows placeholder when customerId is null", () => {
    render(<DispatchSuggestions {...defaultProps} customerId={null} />)
    expect(screen.getByText(/select equipment type/i)).toBeInTheDocument()
  })

  it("shows loading skeleton during fetch", async () => {
    vi.mocked(api.post).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockResult), 1000))
    )

    render(<DispatchSuggestions {...defaultProps} />)

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(350)

    // Should show loading skeletons
    const skeletons = document.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBe(3)
  })

  it("renders ranked suggestions with scores and badges", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)

    render(<DispatchSuggestions {...defaultProps} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Jordan Smith")).toBeInTheDocument()
      expect(screen.getByText("Maria Garcia")).toBeInTheDocument()
    })

    expect(screen.getByText("BEST MATCH")).toBeInTheDocument()
    expect(screen.getByText("Score: 92")).toBeInTheDocument()
    expect(screen.getByText("🚗 12 min")).toBeInTheDocument()
    expect(screen.getByText("⟲ Returning")).toBeInTheDocument()
  })

  it("calls onSelect when clicking a suggestion row", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)
    const onSelect = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onSelect={onSelect} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Jordan Smith")).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText("Jordan Smith"))
    expect(onSelect).toHaveBeenCalledWith("t1")
  })

  it("shows fallback warning banner when fallbackMode is true", async () => {
    vi.mocked(api.post).mockResolvedValue({
      ...mockResult,
      fallbackMode: true,
      suggestions: mockResult.suggestions.map((s) => ({ ...s, skillMatch: false })),
    })

    render(<DispatchSuggestions {...defaultProps} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText(/no techs with furnace skills/i)).toBeInTheDocument()
    })
  })

  it("calls onSkip when clicking Skip suggestions", async () => {
    vi.mocked(api.post).mockResolvedValue(mockResult)
    const onSkip = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onSkip={onSkip} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(screen.getByText("Skip suggestions")).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText("Skip suggestions"))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it("calls onError on API failure", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Network error"))
    const onError = vi.fn()

    render(<DispatchSuggestions {...defaultProps} onError={onError} />)

    await vi.advanceTimersByTimeAsync(350)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })
})

describe("DispatchSuggestions — reassign mode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("calls PATCH /api/jobs/:id when a tech is selected in reassign mode", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(api.post).mockResolvedValue(mockResult)
    vi.mocked(api.patch).mockResolvedValue({})

    render(
      <DispatchSuggestions
        {...defaultProps}
        mode="reassign"
        jobId="job-123"
      />
    )

    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeInTheDocument())

    // Clicking the tech row triggers handleAssign which calls PATCH in reassign mode
    await user.click(screen.getByText("Jordan Smith"))

    expect(api.patch).toHaveBeenCalledWith("/api/jobs/job-123", { technicianId: "t1" })
  })

  it("shows toast error and does not call onSelect when PATCH fails in reassign mode", async () => {
    const { toast } = await import("sonner")
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(api.post).mockResolvedValue(mockResult)
    vi.mocked(api.patch).mockRejectedValue(new Error("Server error"))

    render(
      <DispatchSuggestions
        {...defaultProps}
        mode="reassign"
        jobId="job-123"
      />
    )

    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeInTheDocument())

    await user.click(screen.getByText("Jordan Smith"))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to reassign technician"))
    expect(defaultProps.onSelect).not.toHaveBeenCalled()
  })
})
