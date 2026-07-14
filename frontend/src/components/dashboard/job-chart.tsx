import type { ChartDataPoint } from "@/api/types"
import { Loader2 } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useTheme } from "@/theme/theme-context"

interface JobChartProps {
  data: ChartDataPoint[]
  loading?: boolean
}

export function JobChart({ data, loading }: JobChartProps) {
  const { theme } = useTheme()

  const isDark = theme === "dark"

  const colors = isDark
    ? {
        grid: "rgba(255,255,255,0.06)",
        tick: "rgba(255,255,255,0.40)",
        tooltipBg: "#1e2030",
        tooltipBorder: "rgba(255,255,255,0.08)",
        tooltipText: "#e0e0e8",
        completedStroke: "#7c8aff",
        completedFillStart: "rgba(124,138,255,0.35)",
        completedFillEnd: "rgba(124,138,255,0.02)",
        scheduledStroke: "rgba(124,138,255,0.45)",
        scheduledFillStart: "rgba(124,138,255,0.12)",
        scheduledFillEnd: "rgba(124,138,255,0.01)",
      }
    : {
        grid: "rgba(0,0,0,0.04)",
        tick: "rgba(0,0,0,0.35)",
        tooltipBg: "#ffffff",
        tooltipBorder: "rgba(0,0,0,0.06)",
        tooltipText: "#1a1a2e",
        completedStroke: "#4361ee",
        completedFillStart: "rgba(67,97,238,0.25)",
        completedFillEnd: "rgba(67,97,238,0.01)",
        scheduledStroke: "rgba(67,97,238,0.35)",
        scheduledFillStart: "rgba(67,97,238,0.10)",
        scheduledFillEnd: "rgba(67,97,238,0.01)",
      }

  if (loading) {
    return (
      <div className="medops-card p-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading chart...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="medops-card p-6">
      <div className="mb-5">
        <h3 className="text-base font-bold text-card-foreground">
          Weekly Job Volume
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Completed vs scheduled this week
        </p>
      </div>
      <div className="flex items-center gap-5 mb-5">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.completedStroke }} />
          <span className="text-xs text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.scheduledStroke }} />
          <span className="text-xs text-muted-foreground">Scheduled</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.completedFillStart} stopOpacity={1} />
              <stop offset="95%" stopColor={colors.completedFillEnd} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="gradScheduled" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.scheduledFillStart} stopOpacity={1} />
              <stop offset="95%" stopColor={colors.scheduledFillEnd} stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.grid}
            vertical={false}
          />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.tick, fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.tick, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: "12px",
              color: colors.tooltipText,
              fontSize: "12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              padding: "8px 12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="scheduled"
            stroke={colors.scheduledStroke}
            strokeWidth={2}
            fill="url(#gradScheduled)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="completed"
            stroke={colors.completedStroke}
            strokeWidth={2.5}
            fill="url(#gradCompleted)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
