import { Link } from "react-router-dom"
import type { ReactNode } from "react"

export function LegalLayout({
  title,
  effectiveDate,
  children,
}: {
  title: string
  effectiveDate: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="font-black tracking-tight text-gray-900">PNEUROS</Link>
          <div className="flex items-center gap-4 text-sm font-semibold text-gray-500">
            <Link to="/login" className="hover:text-gray-900 transition-colors">Sign in</Link>
            <Link
              to="/register"
              className="rounded-full bg-[#ec3013] px-5 py-2 text-sm font-bold text-white hover:bg-[#ae1800] transition-colors"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 lg:px-10 py-16">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#ec3013] mb-3">Legal</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-400 mb-12">Effective {effectiveDate}</p>

        <div className="space-y-10 text-[15px] leading-relaxed text-gray-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_a]:text-[#ec3013] [&_a]:font-semibold [&_a:hover]:underline">
          {children}
        </div>
      </main>

      <footer className="py-10 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 flex items-center justify-between text-xs text-gray-400">
          <span className="font-black text-gray-900">PNEUROS</span>
          <span>© 2026 Pneuros. HVAC field service platform.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-gray-700 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-gray-700 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
