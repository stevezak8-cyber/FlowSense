import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "./types.js";

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
