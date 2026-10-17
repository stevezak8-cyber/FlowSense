import { useState } from "react"
import { Button } from "@/components/ui/button"

export interface ShownLogin { label: string; name: string; email: string; password: string }

// Credentials shown once after a founder action. Copy puts "email<TAB>password" on the clipboard.
export function LoginList({ logins }: { logins: ShownLogin[] }) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500)
    } catch {
      /* clipboard unavailable; the text is selectable */
    }
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <tbody>
          {logins.map((l) => {
            const text = `${l.email}\t${l.password}`
            return (
              <tr key={l.email} className="border-t first:border-t-0">
                <td className="px-3 py-2 font-medium">{l.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.email}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.password}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => copy(text)}>
                    {copied === text ? "Copied" : "Copy"}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
