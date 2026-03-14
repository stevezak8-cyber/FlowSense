import type { ChartDataPoint } from "@/api/types"
import { Loader2 } from "lucide-react"
import {
  BarChart,
  Bar,
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

  const colors = theme === "dark"
    ? {
        grid: "rgba(255,255,255,0.06)",
        tick: "rgba(255,255,255,0.40)",
        tooltipBg: "#1e2030",
        tooltipBorder: "rgba(255,255,255,0.08)",
        tooltipText: "#e0e0e8",
        barFill: "#7c8aff",
        barFillLight: "rgba(124,138,255,0.25)",
      }
    : {
        grid: "rgba(0,0,0,0.04)",
        tick: "rgba(0,0,0,0.35)",
        tooltipBg: "#ffffff",
        tooltipBorder: "rgba(0,0,0,0.06)",
        tooltipText: "#1a1a2e",
        barFill: "#4361ee",
        barFillLight: "rgba(67,97,238,0.15)",
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
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.barFill }} />
          <span className="text-xs text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.barFillLight }} />
          <span className="text-xs text-muted-foreground">Scheduled</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={3}>
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
          <Bar
            dataKey="scheduled"
            fill={colors.barFillLight}
            radius={[6, 6, 0, 0]}
          />
          <Bar
            dataKey="completed"
            fill={colors.barFill}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
