import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ApiJob } from "@/api/types"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

function startOfMonthGrid(viewDate: Date): Date {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const dow = (first.getDay() + 6) % 7 // Monday-start
  const start = new Date(first)
  start.setDate(first.getDate() - dow)
  return start
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface MiniMonthCalendarProps {
  jobs: ApiJob[]
  onSelectDate: (date: Date) => void
}

export function MiniMonthCalendar({ jobs, onSelectDate }: MiniMonthCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const today = new Date()

  const gridStart = startOfMonthGrid(viewDate)
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })

  const jobDatesKey = new Set(
    jobs.map((j) => new Date(j.scheduledAt).toDateString())
  )

  function shiftMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <div className="medops-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-foreground">
          {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d, i) => {
          const inMonth = d.getMonth() === viewDate.getMonth()
          const isToday = sameDay(d, today)
          const hasJobs = jobDatesKey.has(d.toDateString())
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDate(d)}
              className="flex flex-col items-center gap-0.5 py-0.5"
            >
              <span
                className={
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors " +
                  (isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/40 hover:bg-muted")
                }
              >
                {d.getDate()}
              </span>
              <span
                className={
                  "block h-1 w-1 rounded-full " + (hasJobs ? "bg-primary" : "bg-transparent")
                }
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
