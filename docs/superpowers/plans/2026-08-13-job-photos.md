# Job Photos Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let technicians upload photos directly to S3 from job views; let office staff view them read-only in the jobs table expanded row.

**Architecture:** Browser requests a presigned S3 PUT URL from the backend, uploads the file directly to S3 (backend never proxies bytes), then registers the public URL via a second API call. Photos are stored as `String[]` on `Job.photos` (existing field). A single `JobPhotos` component handles both upload and gallery views, controlled by a `canUpload` prop.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, React, Tailwind, shadcn/ui Dialog for lightbox, sonner toasts.

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `backend/src/services/s3.ts` | Create | S3 client, `s3Available()`, `getUploadUrl()`, `deleteObject()` |
| `backend/src/routes/jobs.ts` | Modify | Add 3 photo routes at end of file |
| `backend/src/__tests__/job-photos.test.ts` | Create | 5 route tests |
| `frontend/src/components/jobs/JobPhotos.tsx` | Create | Upload grid + lightbox; `canUpload` prop |
| `frontend/src/api/types.ts` | Modify | Add `PhotoUploadUrlResponse` |
| `frontend/src/components/jobs/completion-dialog.tsx` | Modify | Replace base64 with `<JobPhotos>` |
| `frontend/src/pages/technician/TechnicianJobs.tsx` | Modify | Add Photos section to active job detail |
| `frontend/src/components/jobs/jobs-table.tsx` | Modify | Add Photos section to office expanded row |

---

## Chunk 1: Backend — S3 service + photo routes + tests

### Task 1: S3 service + AWS SDK packages

**Files:**
- Create: `backend/src/services/s3.ts`

- [ ] **Step 1: Install AWS SDK packages**

```bash
cd backend && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Write failing test (import check)**

Create `backend/src/__tests__/job-photos.test.ts` with just:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("../services/s3.js", () => ({
  s3Available: vi.fn().mockReturnValue(true),
  getUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: "https://s3.presigned.example.com/upload",
    publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/abc.jpg",
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "../lib/prisma.js"
import { s3Available, getUploadUrl, deleteObject } from "../services/s3.js"
import { jobsRouter } from "../routes/jobs.js"

const mockPrisma = prisma as unknown as {
  job: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

function makeApp(role = "technician") {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { user: unknown }).user = {
      id: "user1",
      organizationId: "org1",
      role,
    }
    next()
  })
  app.use("/", jobsRouter)
  return app
}

const fakeJob = {
  id: "job1",
  organizationId: "org1",
  photos: ["https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/existing.jpg"],
}

describe("Job photo routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AWS_S3_BUCKET = "my-bucket"
    process.env.AWS_REGION = "us-east-1"
  })

  it("POST /job1/photos/upload-url returns 503 when S3 not available", async () => {
    vi.mocked(s3Available).mockReturnValue(false)
    const res = await request(makeApp())
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(503)
  })

  it("POST /job1/photos/upload-url returns 403 for office role", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    const res = await request(makeApp("office"))
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(403)
  })

  it("POST /job1/photos/upload-url returns uploadUrl and publicUrl", async () => {
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    const res = await request(makeApp())
      .post("/job1/photos/upload-url")
      .send({ contentType: "image/jpeg" })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("uploadUrl")
    expect(res.body).toHaveProperty("publicUrl")
  })

  it("POST /job1/photos appends URL to job.photos", async () => {
    const updatedPhotos = [...fakeJob.photos, "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/new.jpg"]
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    mockPrisma.job.update.mockResolvedValue({ ...fakeJob, photos: updatedPhotos })
    const res = await request(makeApp())
      .post("/job1/photos")
      .send({ url: "https://my-bucket.s3.us-east-1.amazonaws.com/org1/jobs/job1/new.jpg" })
    expect(res.status).toBe(200)
    expect(res.body.photos).toHaveLength(2)
  })

  it("DELETE /job1/photos removes URL and calls deleteObject", async () => {
    const url = fakeJob.photos[0]
    mockPrisma.job.findFirst.mockResolvedValue(fakeJob)
    mockPrisma.job.update.mockResolvedValue({ ...fakeJob, photos: [] })
    const res = await request(makeApp())
      .delete("/job1/photos")
      .send({ url })
    expect(res.status).toBe(200)
    expect(res.body.photos).toHaveLength(0)
    expect(deleteObject).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to confirm it fails (module not found)**

```bash
cd backend && npx vitest run src/__tests__/job-photos.test.ts
```

Expected: FAIL — `Cannot find module '../services/s3.js'`

- [ ] **Step 4: Create `backend/src/services/s3.ts`**

```typescript
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const BUCKET = process.env.AWS_S3_BUCKET ?? ""
const REGION = process.env.AWS_REGION ?? "us-east-1"

function getClient(): S3Client {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  })
}

export function s3Available(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  )
}

export async function getUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getClient()
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: "public-read",
  })
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
  return { uploadUrl, publicUrl }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    const client = getClient()
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (e) {
    console.error("[S3] deleteObject failed:", e)
  }
}
```

- [ ] **Step 5: Add 3 photo routes to `backend/src/routes/jobs.ts`**

First, add imports at the top of the file (after existing imports):

```typescript
import { s3Available, getUploadUrl, deleteObject } from "../services/s3.js"
import { randomUUID } from "crypto"
```

**Note on route check ordering:** The spec lists steps as (1) s3Available, (2) fetch job, (3) verify role, (4) validate contentType. The implementation below checks role and contentType before fetching the job — this is intentionally better: it avoids a DB round-trip for clearly invalid requests and doesn't leak job existence to wrong-role users. The security outcome is strictly better.

Then append the three routes at the end of the file (before the final closing, after the delete route):

```typescript
// Photo routes

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

jobsRouter.post("/:id/photos/upload-url", async (req, res) => {
  if (!s3Available()) {
    return res.status(503).json({ error: "Photo upload not configured" })
  }

  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can upload photos" })
  }

  const { contentType } = req.body
  const ext = ALLOWED_CONTENT_TYPES[contentType as string]
  if (!ext) {
    return res.status(400).json({ error: "Unsupported content type. Allowed: image/jpeg, image/png, image/webp" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  const key = `${organizationId}/jobs/${job.id}/${randomUUID()}.${ext}`
  try {
    const { uploadUrl, publicUrl } = await getUploadUrl(key, contentType)
    return res.json({ uploadUrl, publicUrl })
  } catch (e) {
    return res.status(500).json({ error: "Failed to generate upload URL" })
  }
})

jobsRouter.post("/:id/photos", async (req, res) => {
  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can upload photos" })
  }

  const { url } = req.body
  const bucket = process.env.AWS_S3_BUCKET ?? ""
  if (!url || !url.startsWith(`https://${bucket}.s3.`)) {
    return res.status(400).json({ error: "Invalid photo URL" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  try {
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { photos: { push: url } },
    })
    return res.json({ photos: updated.photos })
  } catch {
    return res.status(500).json({ error: "Failed to save photo" })
  }
})

jobsRouter.delete("/:id/photos", async (req, res) => {
  const { role, organizationId } = req.user!
  if (role !== "technician") {
    return res.status(403).json({ error: "Only technicians can delete photos" })
  }

  const { url } = req.body
  const bucket = process.env.AWS_S3_BUCKET ?? ""
  const region = process.env.AWS_REGION ?? "us-east-1"
  if (!url || !url.startsWith(`https://${bucket}.s3.`)) {
    return res.status(400).json({ error: "Invalid photo URL" })
  }

  const job = await prisma.job.findFirst({
    where: { id: req.params.id, organizationId },
  })
  if (!job) return res.status(404).json({ error: "Job not found" })

  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`
  const key = url.startsWith(prefix) ? url.slice(prefix.length) : null

  try {
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { photos: job.photos.filter((p) => p !== url) },
    })
    if (key) deleteObject(key).catch((e) => console.error("[Photos] deleteObject failed:", e))
    return res.json({ photos: updated.photos })
  } catch {
    return res.status(500).json({ error: "Failed to delete photo" })
  }
})
```

- [ ] **Step 6: Run tests**

```bash
cd backend && npx vitest run src/__tests__/job-photos.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 7: Run full test suite**

```bash
cd backend && npx vitest run
```

Expected: all pass

- [ ] **Step 8: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/s3.ts backend/src/routes/jobs.ts backend/src/__tests__/job-photos.test.ts backend/package.json backend/package-lock.json
git commit -m "feat: S3 photo upload service and job photo routes"
```

---

## Chunk 2: Frontend — JobPhotos component + API type

### Task 2: JobPhotos component + PhotoUploadUrlResponse type

**Files:**
- Create: `frontend/src/components/jobs/JobPhotos.tsx`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add `PhotoUploadUrlResponse` to `frontend/src/api/types.ts`**

Append to the end of `frontend/src/api/types.ts`:

```typescript
export interface PhotoUploadUrlResponse {
  uploadUrl: string
  publicUrl: string
}
```

- [ ] **Step 2: Create `frontend/src/components/jobs/JobPhotos.tsx`**

```typescript
import { useRef, useState } from "react"
import { api } from "@/api/client"
import type { PhotoUploadUrlResponse } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Camera, Trash2, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

interface JobPhotosProps {
  jobId: string
  photos: string[]
  canUpload: boolean
  onPhotosChange?: (photos: string[]) => void
}

export function JobPhotos({ jobId, photos, canUpload, onPhotosChange }: JobPhotosProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [s3Unavailable, setS3Unavailable] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  async function uploadFile(file: File): Promise<string | null> {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large — max 10 MB")
      return null
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP images are supported")
      return null
    }

    let uploadData: PhotoUploadUrlResponse
    try {
      uploadData = await api.post<PhotoUploadUrlResponse>(`/api/jobs/${jobId}/photos/upload-url`, {
        contentType: file.type,
      })
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ""
      if (msg.includes("not configured") || msg.includes("503")) {
        setS3Unavailable(true)
        return null
      }
      toast.error("Upload failed — please try again")
      return null
    }

    // Upload directly to S3 — no auth header (presigned URL handles auth)
    const s3Res = await fetch(uploadData.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    })
    if (!s3Res.ok) {
      toast.error("Upload failed — please try again")
      return null
    }

    return uploadData.publicUrl
  }

  async function handleFiles(files: FileList) {
    setUploading(true)
    const newPhotos = [...photos]

    for (const file of Array.from(files)) {
      const publicUrl = await uploadFile(file)
      if (!publicUrl) continue

      try {
        const result = await api.post<{ photos: string[] }>(`/api/jobs/${jobId}/photos`, {
          url: publicUrl,
        })
        newPhotos.splice(0, newPhotos.length, ...result.photos)
      } catch {
        toast.error("Upload failed — please try again")
      }
    }

    onPhotosChange?.(newPhotos)
    setUploading(false)
  }

  async function handleDelete(url: string) {
    try {
      const result = await api.delete<{ photos: string[] }>(`/api/jobs/${jobId}/photos`, { url })
      onPhotosChange?.(result.photos)
    } catch {
      toast.error("Failed to delete photo")
    }
  }

  if (s3Unavailable) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Photo upload unavailable
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((src, i) => (
            <div key={i} className="group relative aspect-square">
              <img
                src={src}
                alt={`Photo ${i + 1}`}
                className="h-full w-full cursor-pointer rounded-md object-cover"
                onClick={() => setLightboxSrc(src)}
              />
              {canUpload && (
                <button
                  onClick={() => handleDelete(src)}
                  className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:flex"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && !canUpload && (
        <p className="text-sm text-muted-foreground">No photos on this job.</p>
      )}

      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Add Photo"}
          </Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP · max 10 MB</p>
        </>
      )}

      <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxSrc && (
            <img src={lightboxSrc} alt="Full size" className="max-h-[80vh] w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Note:** `api.delete` with a body — check `frontend/src/api/client.ts` to confirm it supports a request body on DELETE. If it only accepts `api.delete(url)`, use `api.post` with a `_method` override or switch to a custom fetch. More likely: update the `delete` method in `api/client.ts` to accept an optional body, or use `fetch` directly. Read the client first before implementing.

- [ ] **Step 3: Check `frontend/src/api/client.ts` for delete body support**

```bash
cat frontend/src/api/client.ts
```

If `delete` doesn't support a body, add body support or use a named `deletePhoto` helper calling `fetch` directly with `method: "DELETE"` and `body: JSON.stringify({ url })`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobs/JobPhotos.tsx frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat: JobPhotos component with S3 presigned upload"
```

---

## Chunk 3: Frontend — wire JobPhotos into completion dialog + tech + office views

### Task 3: Replace base64 in completion dialog

**Files:**
- Modify: `frontend/src/components/jobs/completion-dialog.tsx`

The current completion dialog has `photos: string[]` state (base64), `handlePhotoFiles`, `removePhoto`, and sends photos in the PATCH body. Replace all of this with `<JobPhotos>`.

- [ ] **Step 1: Read the completion dialog**

```bash
cat frontend/src/components/jobs/completion-dialog.tsx
```

Note all lines that reference `photos`, `handlePhotoFiles`, `removePhoto`, `Camera`, and the file input.

- [ ] **Step 2: Modify `completion-dialog.tsx`**

Changes:
1. Remove `photos` state: `const [photos, setPhotos] = useState<string[]>([])`
2. Remove `handlePhotoFiles` and `removePhoto` functions
3. Remove `Camera` from lucide imports (no longer used directly)
4. Add import: `import { JobPhotos } from "./JobPhotos"`
5. Remove `photos: photos.length > 0 ? photos : undefined` from the `handleComplete` PATCH body (photos are saved eagerly on upload, not at completion time)
6. Replace the photo picker JSX section with:

```tsx
<div>
  <Label>Photos</Label>
  <div className="mt-2">
    <JobPhotos
      jobId={job.id}
      photos={job.photos ?? []}
      canUpload={true}
      onPhotosChange={(updatedPhotos) => {
        // Update the local job reference so photo count reflects immediately
        job.photos = updatedPhotos
      }}
    />
  </div>
</div>
```

Note: `job` is a prop (`ApiJob`), so mutating `job.photos` directly is a shortcut. If the parent passes a stable object ref, this works. If not, lift via `onCompleted` — the subagent should use whichever pattern is cleanest given the actual component structure.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/jobs/completion-dialog.tsx
git commit -m "feat: replace base64 photo upload in completion dialog with S3 JobPhotos"
```

---

### Task 4: Add Photos section to TechnicianJobs active job view

**Files:**
- Modify: `frontend/src/pages/technician/TechnicianJobs.tsx`

- [ ] **Step 1: Read the expanded job detail section in TechnicianJobs**

```bash
grep -n "expandedId\|expand\|preArrival\|Photos\|photo\|AiChat" frontend/src/pages/technician/TechnicianJobs.tsx | head -30
```

Identify where the expanded job detail renders (the block that shows when `expandedId === job.id`).

- [ ] **Step 2: Add Photos section to TechnicianJobs**

Add import at top:
```typescript
import { JobPhotos } from "@/components/jobs/JobPhotos"
```

In the expanded job detail JSX, add a Photos card section (alongside the existing pre-arrival, equipment notes, Ask AI sections):

```tsx
{/* Photos */}
<div className="rounded-lg border border-border bg-card p-4">
  <h3 className="mb-3 text-sm font-semibold text-card-foreground">Photos</h3>
  <JobPhotos
    jobId={job.id}
    photos={job.photos ?? []}
    canUpload={true}
    onPhotosChange={(updatedPhotos) =>
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, photos: updatedPhotos } : j))
      )
    }
  />
</div>
```

Place it after the pre-arrival/equipment section, before the action buttons.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/technician/TechnicianJobs.tsx
git commit -m "feat: add Photos section to technician active job view"
```

---

### Task 5: Add Photos section to office jobs-table expanded row

**Files:**
- Modify: `frontend/src/components/jobs/jobs-table.tsx`

**Note on spec vs reality:** The spec references `OfficeJobs.tsx` with a "Photos tab." In practice, `OfficeJobs.tsx` only renders `<JobsTable>` — there is no separate detail panel or tab structure. The job detail IS the expanded row in `jobs-table.tsx`. The correct file to modify is `jobs-table.tsx`, not `OfficeJobs.tsx`. No tab implementation is needed.

The expanded row (`isExpanded && ...`) currently shows Location, Notes, ComplianceTimeline, and the recurring job confirmation form. Add a Photos section at the bottom.

- [ ] **Step 1: Read the expanded row section**

```bash
grep -n "isExpanded\|expandedJob\|ComplianceTimeline\|photos" frontend/src/components/jobs/jobs-table.tsx | head -20
```

- [ ] **Step 2: Add Photos to jobs-table expanded row**

Add import at top:
```typescript
import { JobPhotos } from "./JobPhotos"
```

In the `isExpanded &&` block, after `<ComplianceTimeline jobId={job.id} />` and before the recurring job section, add:

```tsx
{job.photos && job.photos.length > 0 && (
  <div className="mt-4">
    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      Photos ({job.photos.length})
    </span>
    <div className="mt-2">
      <JobPhotos
        jobId={job.id}
        photos={job.photos}
        canUpload={false}
      />
    </div>
  </div>
)}
```

Only renders when photos exist — office staff can't upload, so no reason to show an empty state with the "Add Photo" button.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full backend test suite one more time**

```bash
cd backend && npx vitest run
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/jobs/jobs-table.tsx
git commit -m "feat: show photo gallery in office jobs table expanded row"
```
