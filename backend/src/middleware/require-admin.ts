import { Request, Response, NextFunction } from "express"

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "forbidden", message: "Admin access required." })
  }
  next()
}
