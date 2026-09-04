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
        grid: "rgba(243,242,242,0.07)",
        tick: "rgba(243,242,242,0.45)",
        tooltipBg: "#242220",
        tooltipBorder: "#3a3735",
        tooltipText: "#f3f2f2",
        completedStroke: "#ec3013",
        completedFillStart: "rgba(236,48,19,0.30)",
        completedFillEnd: "rgba(236,48,19,0.02)",
        scheduledStroke: "#7d7979",
        scheduledFillStart: "rgba(125,121,121,0.20)",
        scheduledFillEnd: "rgba(125,121,121,0.01)",
      }
    : {
        grid: "rgba(32,30,29,0.06)",
        tick: "rgba(32,30,29,0.45)",
        tooltipBg: "#fbfaf9",
        tooltipBorder: "#d7d3d3",
        tooltipText: "#201e1d",
        completedStroke: "#ec3013",
        completedFillStart: "rgba(236,48,19,0.25)",
        completedFillEnd: "rgba(236,48,19,0.02)",
        scheduledStroke: "#9b9797",
        scheduledFillStart: "rgba(155,151,151,0.18)",
        scheduledFillEnd: "rgba(155,151,151,0.01)",
      }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading chart...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Weekly Job Volume
        </h3>
        <p className="mt-1 text-sm font-semibold text-card-foreground">
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
