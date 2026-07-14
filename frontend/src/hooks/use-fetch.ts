import { useState, useEffect, useCallback, useRef } from "react"
import { api } from "@/api/client"

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Simple data-fetching hook with loading/error state.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFetch<ApiJob[]>("/api/jobs")
 *   if (loading) return <Spinner />
 *   if (error) return <PageError message={error} onRetry={refetch} />
 */
export function useFetch<T>(path: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const pathRef = useRef(path)
  pathRef.current = path

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api.get<T>(pathRef.current)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message ?? "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const refetch = useCallback(() => setTick((n) => n + 1), [])

  return { data, loading, error, refetch }
}
