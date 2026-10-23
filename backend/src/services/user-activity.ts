import { prisma } from "../lib/prisma.js"

// A signed-in app makes many requests a minute; writing "last active" on each
// would hammer the users table for no gain. Once per window is plenty to tell
// "used it today" from "never came back".
export const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000
const MAX_TRACKED = 10_000

const lastWritten = new Map<string, number>()

/**
 * Notes that a signed-in user just made a request. Fire-and-forget: tracking
 * must never slow down or break the request it rides on.
 */
export function recordActivity(userId: string, now: number = Date.now()): void {
  const previous = lastWritten.get(userId)
  if (previous !== undefined && now - previous < ACTIVITY_WRITE_INTERVAL_MS) return

  if (lastWritten.size >= MAX_TRACKED) lastWritten.clear()
  lastWritten.set(userId, now)

  try {
    // updateMany, not update: a reset demo account leaves old tokens pointing
    // at users that no longer exist, and that shouldn't log an error each time.
    prisma.user
      .updateMany({ where: { id: userId }, data: { lastActiveAt: new Date(now) } })
      .catch(() => lastWritten.delete(userId))
  } catch {
    lastWritten.delete(userId)
  }
}

/** Notes a successful sign-in. Never throws. */
export async function recordLogin(userId: string, now: Date = new Date()): Promise<void> {
  lastWritten.set(userId, now.getTime())
  try {
    await prisma.user.updateMany({ where: { id: userId }, data: { lastLoginAt: now, lastActiveAt: now } })
  } catch (e) {
    console.error("[user-activity] could not record login:", e instanceof Error ? e.message : e)
  }
}

/** For tests. */
export function resetActivityTracking(): void {
  lastWritten.clear()
}
