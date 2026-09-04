import { useEffect, useState } from "react"
import { api } from "@/api/client"
import { Loader2, Wind, Droplets, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface WeatherData {
  city: string
  current: {
    temperature_2m: number
    apparent_temperature: number
    weathercode: number
    windspeed_10m: number
    relativehumidity_2m: number
  }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weathercode: number[]
    precipitation_probability_max: number[]
  }
}

function weatherLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear", emoji: "☀️" }
  if (code <= 2) return { label: "Partly Cloudy", emoji: "⛅" }
  if (code === 3) return { label: "Overcast", emoji: "☁️" }
  if (code <= 49) return { label: "Foggy", emoji: "🌫️" }
  if (code <= 59) return { label: "Drizzle", emoji: "🌦️" }
  if (code <= 69) return { label: "Rain", emoji: "🌧️" }
  if (code <= 79) return { label: "Snow", emoji: "❄️" }
  if (code <= 84) return { label: "Rain Showers", emoji: "🌦️" }
  if (code <= 99) return { label: "Thunderstorm", emoji: "⛈️" }
  return { label: "Unknown", emoji: "🌡️" }
}

function isHeatAlert(temp: number) { return temp >= 95 }
function isColdAlert(temp: number) { return temp <= 20 }

export function WeatherWidget({ city }: { city?: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    function fetchWeather(query: string) {
      api.get<WeatherData>(`/api/dashboard/weather${query}`)
        .then(setWeather)
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(`?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`),
        () => {
          // Permission denied — fall back to org city
          const q = city ? `?city=${encodeURIComponent(city)}` : ""
          fetchWeather(q)
        },
        { timeout: 6000 }
      )
    } else {
      const q = city ? `?city=${encodeURIComponent(city)}` : ""
      fetchWeather(q)
    }
  }, [city])

  if (loading) return (
    <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading weather…</span>
    </div>
  )

  if (error || !weather) return null

  const { current, daily } = weather
  const { label, emoji } = weatherLabel(current.weathercode)
  const heatAlert = isHeatAlert(current.temperature_2m)
  const coldAlert = isColdAlert(current.temperature_2m)
  const alert = heatAlert || coldAlert

  return (
    <div className={cn(
      "rounded-2xl border bg-card p-5 space-y-4",
      alert ? "border-amber-500/60" : "border-border"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{weather.city}</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-extrabold text-foreground">{Math.round(current.temperature_2m)}°</span>
            <span className="text-2xl mb-1">{emoji}</span>
          </div>
          <p className="text-xs text-muted-foreground">{label} · Feels like {Math.round(current.apparent_temperature)}°</p>
        </div>
        <div className="text-right space-y-1.5 mt-1">
          <div className="flex items-center gap-1.5 justify-end text-xs text-muted-foreground">
            <Wind className="h-3 w-3" />{Math.round(current.windspeed_10m)} mph
          </div>
          <div className="flex items-center gap-1.5 justify-end text-xs text-muted-foreground">
            <Droplets className="h-3 w-3" />{current.relativehumidity_2m}% humidity
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {alert && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {heatAlert ? "Heat advisory — high AC demand expected today" : "Cold snap — furnace calls likely to spike"}
          </p>
        </div>
      )}

      {/* 5-day forecast */}
      <div className="grid grid-cols-5 gap-1">
        {daily.time.slice(0, 5).map((date, i) => {
          const { emoji: e } = weatherLabel(daily.weathercode[i])
          const day = i === 0 ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })
          return (
            <div key={date} className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/50 py-2 px-1">
              <p className="text-[9px] font-semibold text-muted-foreground">{day}</p>
              <span className="text-base">{e}</span>
              <p className="text-[10px] font-bold text-foreground">{Math.round(daily.temperature_2m_max[i])}°</p>
              <p className="text-[9px] text-muted-foreground">{Math.round(daily.temperature_2m_min[i])}°</p>
              {daily.precipitation_probability_max[i] > 20 && (
                <p className="text-[8px] text-blue-500">{daily.precipitation_probability_max[i]}%</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
