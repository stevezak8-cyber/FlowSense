import type { ApiJob } from "@/api/types"

export interface JobBoard {
  /** Open jobs marked high or urgent. */
  priority: ApiJob[]
  /** Everything still to do: today's work, anything left over, and upcoming days. */
  open: ApiJob[]
  /** Finished today. */
  completedToday: ApiJob[]
  /** Cancelled from today onward. */
  cancelled: ApiJob[]
  /** Today's workload: open jobs due today or earlier, plus what's done today. */
  totalToday: number
  /** Open jobs due today or earlier. */
  leftToday: number
  progressPct: number
}

/**
 * Splits a technician's jobs into the board the home screen shows. The API returns
 * a technician's whole history, so "today" has to be worked out here: counting every
 * job ever assigned made a shop six months in report "66 jobs today".
 */
export function deriveJobBoard(jobs: ApiJob[], now: Date = new Date()): JobBoard {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const end = start + 24 * 60 * 60 * 1000
  const at = (j: ApiJob) => new Date(j.scheduledAt).getTime()
  const isOpen = (j: ApiJob) => j.status !== "completed" && j.status !== "cancelled"

  const open = jobs.filter(isOpen)
  const completedToday = jobs.filter((j) => j.status === "completed" && at(j) >= start && at(j) < end)
  const cancelled = jobs.filter((j) => j.status === "cancelled" && at(j) >= start)
  const priority = open.filter((j) => j.priority === "high" || j.priority === "urgent")
  const leftToday = open.filter((j) => at(j) < end).length
  const totalToday = leftToday + completedToday.length
  const progressPct = totalToday > 0 ? Math.round((completedToday.length / totalToday) * 100) : 0

  return { priority, open, completedToday, cancelled, totalToday, leftToday, progressPct }
}
