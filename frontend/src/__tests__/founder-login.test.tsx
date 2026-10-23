import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const navigate = vi.fn()
const login = vi.fn()
const logout = vi.fn()
let authState: { user: unknown; loading: boolean } = { user: null, loading: false }

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }))
vi.mock("@/auth/auth-context", () => ({ useAuth: () => ({ ...authState, login, logout }) }))
vi.mock("@/api/client", () => ({ api: { get: vi.fn() } }))
vi.mock("@/components/brand", () => ({ PneurosLogo: () => <div>logo</div> }))
vi.mock("@/components/aurora-backdrop", () => ({ AuroraBackdrop: () => null }))

import { api } from "@/api/client"
import FounderLoginPage from "../pages/FounderLoginPage"

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
}

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: null, loading: false }
  login.mockResolvedValue(undefined)
})

describe("FounderLoginPage", () => {
  it("keeps itself out of search results", () => {
    render(<FounderLoginPage />)
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex")
  })

  it("sends the founder to /platform after signing in", async () => {
    vi.mocked(api.get).mockResolvedValue({ admin: true })
    render(<FounderLoginPage />)
    fill("founder@pneuros.com", "pw")
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/platform", { replace: true }))
    expect(login).toHaveBeenCalledWith("founder@pneuros.com", "pw")
    expect(api.get).toHaveBeenCalledWith("/api/platform/me")
    expect(logout).not.toHaveBeenCalled()
  })

  it("signs a valid non-founder account straight back out and gives the same generic error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Not found"))
    render(<FounderLoginPage />)
    fill("shopowner@example.com", "right-password")
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password")
    expect(logout).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("shows the same error for a wrong password, and never asks the platform API", async () => {
    login.mockRejectedValue(new Error("Invalid email or password"))
    render(<FounderLoginPage />)
    fill("founder@pneuros.com", "wrong")
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password")
    expect(api.get).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it("doesn't reveal a server message that could tell the two failures apart", async () => {
    login.mockRejectedValue(new Error("Too many attempts, try again later"))
    render(<FounderLoginPage />)
    fill("founder@pneuros.com", "x")
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Invalid email or password$/)
  })

  it("goes straight to /platform for a visitor who is already signed in as the founder", async () => {
    authState = { user: { role: "office" }, loading: false }
    vi.mocked(api.get).mockResolvedValue({ admin: true })
    render(<FounderLoginPage />)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/platform", { replace: true }))
  })

  it("shows the form, not a redirect, for a signed-in shop user who isn't the founder", async () => {
    authState = { user: { role: "office" }, loading: false }
    vi.mocked(api.get).mockRejectedValue(new Error("Not found"))
    render(<FounderLoginPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })
})
