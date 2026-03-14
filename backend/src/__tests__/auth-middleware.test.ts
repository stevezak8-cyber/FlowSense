import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock jsonwebtoken
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
  },
}));

import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth.js";

describe("requireAuth middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis() as unknown as Response["status"],
      json: vi.fn().mockReturnThis() as unknown as Response["json"],
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it("returns 401 when no authorization header", () => {
    requireAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is not Bearer", () => {
    req.headers = { authorization: "Basic abc123" };
    requireAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", () => {
    req.headers = { authorization: "Bearer invalid-token" };
    (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("invalid token");
    });
    requireAuth(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches user to request and calls next on valid token", () => {
    const payload = { userId: "user-1", role: "office", organizationId: "org-1" };
    req.headers = { authorization: "Bearer valid-token" };
    (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(payload);

    requireAuth(req as Request, res as Response, next);
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
