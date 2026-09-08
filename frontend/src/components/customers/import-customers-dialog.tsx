import { useRef, useState } from "react"
import { api } from "@/api/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react"

interface Props {
  onImported: () => void
}

type Step = "upload" | "map" | "result"
type ImportResult = { created: number; skipped: { row: number; reason: string }[] }

const FIELD_DEFS: { key: string; label: string; required: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "address", label: "Address", required: true },
  { key: "addressLine2", label: "Address Line 2", required: false },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State", required: true },
  { key: "postalCode", label: "Postal Code", required: true },
  { key: "email", label: "Email", required: false },
  { key: "notes", label: "Notes", required: false },
]

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "fullname", "customername", "clientname", "contactname"],
  phone: ["phone", "phonenumber", "mobile", "cell", "cellphone", "contactnumber", "telephone"],
  address: ["address", "street", "streetaddress", "address1", "addressline1"],
  addressLine2: ["address2", "addressline2", "apt", "suite", "unit"],
  city: ["city", "town"],
  state: ["state", "province"],
  postalCode: ["zip", "zipcode", "postalcode", "postcode"],
  email: ["email", "emailaddress"],
  notes: ["notes", "note", "comments", "comment", "description"],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function autoMap(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const normalized = headers.map(normalizeHeader)
  for (const field of FIELD_DEFS) {
    const aliases = HEADER_ALIASES[field.key]
    const idx = normalized.findIndex((h) => aliases.includes(h))
    if (idx !== -1) mapping[field.key] = idx
  }
  return mapping
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const NONE = "__none__"

export function ImportCustomersDialog({ onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("upload")
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [result, setResult] = useState<ImportResult | null>(null)

  function reset() {
    setStep("upload")
    setError("")
    setHeaders([])
    setRows([])
    setMapping({})
    setResult(null)
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setParsing(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const data = await api.upload<{ headers: string[]; rows: string[][]; rowCount: number }>(
        "/api/customers/import/parse",
        formData
      )
      setHeaders(data.headers)
      setRows(data.rows)
      setMapping(autoMap(data.headers))
      setStep("map")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read that file")
    } finally {
      setParsing(false)
    }
  }

  async function handleCommit() {
    setCommitting(true)
    setError("")
    try {
      const data = await api.post<ImportResult>("/api/customers/import/commit", { headers, rows, mapping })
      setResult(data)
      setStep("result")
      if (data.created > 0) onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setCommitting(false)
    }
  }

  function downloadTemplate() {
    downloadCsv(
      "pneuros-customer-import-template.csv",
      "Name,Phone,Address,Address Line 2,City,State,Postal Code,Email,Notes\nJane Doe,555-123-4567,123 Main St,,Austin,TX,78701,jane@example.com,\n"
    )
  }

  function downloadSkippedRows() {
    if (!result || result.skipped.length === 0) return
    const reasonByRow = new Map(result.skipped.map((s) => [s.row, s.reason]))
    const lines = [[...headers, "Import error"].map(csvEscape).join(",")]
    rows.forEach((row, i) => {
      const rowNumber = i + 2
      const reason = reasonByRow.get(rowNumber)
      if (!reason) return
      lines.push([...row, reason].map(csvEscape).join(","))
    })
    downloadCsv("pneuros-import-skipped-rows.csv", lines.join("\n"))
  }

  function csvEscape(v: string): string {
    return `"${(v ?? "").replace(/"/g, '""')}"`
  }

  const missingRequired = FIELD_DEFS.filter((f) => f.required && mapping[f.key] === undefined)

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customers from CSV</DialogTitle>
          {step === "upload" && (
            <DialogDescription>
              Upload a spreadsheet exported from your current system — we'll walk you through matching its columns.
            </DialogDescription>
          )}
          {step === "map" && (
            <DialogDescription>
              Match each field to a column from your file, then review the preview below.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Select a .csv file to get started</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
                {parsing ? "Reading file..." : "Choose file"}
              </Button>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Download a template CSV
            </button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"} found in your file.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FIELD_DEFS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {field.label}
                    {field.required && " *"}
                  </label>
                  <Select
                    value={mapping[field.key] !== undefined ? String(mapping[field.key]) : NONE}
                    onValueChange={(v) =>
                      setMapping((prev) => {
                        const next = { ...prev }
                        if (v === NONE) delete next[field.key]
                        else next[field.key] = Number(v)
                        return next
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not mapped</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="max-h-56 overflow-x-auto overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {FIELD_DEFS.map((f) => (
                      <TableHead key={f.key} className="whitespace-nowrap">
                        {f.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {FIELD_DEFS.map((f) => (
                        <TableCell key={f.key} className="whitespace-nowrap text-xs">
                          {mapping[f.key] !== undefined ? row[mapping[f.key]] || "—" : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 5 && (
              <p className="text-xs text-muted-foreground">Showing a preview of the first 5 rows.</p>
            )}

            {missingRequired.length > 0 && (
              <p className="text-sm text-destructive">
                Missing required field{missingRequired.length > 1 ? "s" : ""}: {missingRequired.map((f) => f.label).join(", ")}
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {result.created} customer{result.created === 1 ? "" : "s"} imported
                </p>
                {result.skipped.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} skipped
                  </p>
                )}
              </div>
            </div>

            {result.skipped.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Skipped rows
                  </p>
                  <button
                    type="button"
                    onClick={downloadSkippedRows}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download skipped rows
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.skipped.map((s) => (
                        <TableRow key={s.row}>
                          <TableCell className="text-xs">{s.row}</TableCell>
                          <TableCell className="text-xs">{s.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
          {step === "map" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button type="button" onClick={handleCommit} disabled={committing || missingRequired.length > 0}>
                {committing ? "Importing..." : `Import ${rows.length} customer${rows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
