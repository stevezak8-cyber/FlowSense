import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PageErrorProps {
  message?: string
  onRetry?: () => void
}

/**
 * Drop-in replacement for blank pages when an API fetch fails.
 * Usage:
 *   const [error, setError] = useState<string | null>(null)
 *   ...fetch().catch(e => setError(e.message))
 *   if (error) return <PageError message={error} onRetry={() => { setError(null); refetch() }} />
 */
export function PageError({ message, onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium text-foreground">Failed to load</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {message ?? "Something went wrong. Check your connection and try again."}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  )
}
