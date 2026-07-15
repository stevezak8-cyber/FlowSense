import { enqueue } from "@/lib/sync-queue"
import toast from "react-hot-toast"

const BASE = "";
const TOKEN_KEY = "flowsense_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired or definitively invalid — clear it and let the auth
    // context redirect. Use a custom event rather than a hard page reload
    // so React Router handles navigation without nuking component state.
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent("flowsense:session-expired"));
    throw new Error("Session expired");
  }

  if (res.status === 402) {
    const data = await res.json().catch(() => ({ error: "subscription_cancelled" }));
    if ((data as { error?: string }).error === "subscription_cancelled") {
      window.dispatchEvent(new CustomEvent("subscription:cancelled"));
    }
    throw new Error((data as { error?: string }).error ?? "subscription_cancelled");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  // 204 No Content — return null rather than trying to parse empty body
  if (res.status === 204) return null as unknown as T;
  return res.json() as Promise<T>;
}

async function patchWithQueue<T>(path: string, body: unknown): Promise<T> {
  try {
    return await request<T>(path, { method: "PATCH", body: JSON.stringify(body) })
  } catch (err) {
    if (
      err instanceof TypeError &&
      err.message.toLowerCase().includes("fetch") &&
      path.includes("/api/jobs/")
    ) {
      await enqueue({
        method: "PATCH",
        url: path,
        body: body as object,
        timestamp: Date.now(),
        retryCount: 0,
      })
      toast("You're offline — update queued", { icon: "📶" })
      return null as unknown as T
    }
    throw err
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => patchWithQueue<T>(path, body),
  delete: <T = void>(path: string) =>
    request<T>(path, { method: "DELETE" }),
};
