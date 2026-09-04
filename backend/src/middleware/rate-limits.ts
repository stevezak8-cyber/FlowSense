import rateLimit from "express-rate-limit"

export function createDemoLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: "Too many demo sign-ins — please try again in one minute" },
    standardHeaders: true,
    legacyHeaders: false,
  })
}
