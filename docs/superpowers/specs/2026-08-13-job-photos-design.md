# Job Photos — Design Spec

**Date:** 2026-08-13
**Feature:** Photo upload and viewing on job records — technicians upload via S3 presigned URLs; office staff view read-only
**Status:** Approved for implementation

---

## Overview

Technicians can attach photos to a job at any point during its lifecycle (before, during, or at completion). Photos are uploaded directly from the browser to AWS S3 via presigned PUT URLs — the Express backend is never a byte-level proxy. Office staff can view photos on the job detail panel but cannot upload. The existing `photos String[]` field on `Job` stores S3 public URLs; no schema migration is required.

The current completion dialog stores base64 data URLs in PostgreSQL — this is replaced with the real upload flow.

---

## Architecture

```
Browser → POST /api/jobs/:id/photos/upload-url → Backend generates presigned PUT URL
Browser → PUT {presignedUrl} (direct to S3, bypasses backend)
Browser → POST /api/jobs/:id/photos { url } → Backend appends URL to job.photos[]
```

Delete flow:
```
Browser → DELETE /api/jobs/:id/photos { url } → Backend removes from job.photos[] + calls S3 deleteObject
```

---

## Backend

### New file: `backend/src/services/s3.ts`

Thin wrapper around `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.

**Exports:**

```typescript
export function s3Available(): boolean
// Returns true if AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are all set.

export async function getUploadUrl(key: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }>
// Generates a presigned S3 PutObject URL (5-minute expiry).
// publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`

export async function deleteObject(key: string): Promise<void>
// Calls S3 DeleteObject. Errors logged, not thrown.
```

**Environment variables:**
- `AWS_ACCESS_KEY_ID` — required
- `AWS_SECRET_ACCESS_KEY` — required
- `AWS_S3_BUCKET` — required
- `AWS_REGION` — optional, defaults to `"us-east-1"`

If any required var is missing, `s3Available()` returns false and the upload-url route returns 503.

S3 bucket must have public read enabled (ACL `public-read` on objects, or bucket policy). Object keys follow the pattern `{organizationId}/jobs/{jobId}/{uuid}.{ext}`.

### Modified file: `backend/src/routes/jobs.ts`

Three new routes, all requiring JWT auth (`requireAuth` middleware already used in this file):

**`POST /api/jobs/:id/photos/upload-url`** — technician role only

Request body:
```typescript
{ contentType: string }  // e.g. "image/jpeg", "image/png", "image/webp"
```

Steps:
1. Verify `s3Available()` — return 503 if not
2. Fetch job, verify `job.organizationId === req.organizationId` — return 404 if not found or wrong org
3. Verify `req.role === "technician"` — return 403 otherwise
4. Validate `contentType` is one of `image/jpeg`, `image/png`, `image/webp`, `image/gif` — return 400 otherwise
5. Derive extension from contentType (`jpeg`→`jpg`, `png`→`png`, `webp`→`webp`, `gif`→`gif`)
6. Generate key: `{organizationId}/jobs/{jobId}/{randomUUID()}.{ext}`
7. Call `getUploadUrl(key, contentType)` — return `{ uploadUrl, publicUrl }`

Response:
```typescript
{ uploadUrl: string; publicUrl: string }
```

**`POST /api/jobs/:id/photos`** — technician role only

Request body:
```typescript
{ url: string }
```

Steps:
1. Fetch job, verify org ownership
2. Verify `req.role === "technician"`
3. Validate `url` starts with `https://${AWS_S3_BUCKET}.s3.` — return 400 if not (prevents arbitrary URL injection)
4. Append `url` to `job.photos` via `prisma.job.update({ data: { photos: { push: url } } })`
5. Return updated `{ photos }` array

**`DELETE /api/jobs/:id/photos`** — technician role only

Request body:
```typescript
{ url: string }
```

Steps:
1. Fetch job, verify org ownership
2. Verify `req.role === "technician"`
3. Validate `url` starts with `https://${AWS_S3_BUCKET}.s3.`
4. Extract key from URL (strip `https://{bucket}.s3.{region}.amazonaws.com/`)
5. Remove `url` from `job.photos` array via `prisma.job.update`
6. Call `deleteObject(key)` (fire-and-forget, errors logged)
7. Return updated `{ photos }` array

### Tests: `backend/src/__tests__/job-photos.test.ts`

5 tests:
1. `upload-url` returns 503 if S3 not configured
2. `upload-url` returns 403 if role is not technician
3. `upload-url` returns `{ uploadUrl, publicUrl }` for valid request (mock `getUploadUrl`)
4. `POST /photos` appends URL to job.photos
5. `DELETE /photos` removes URL and calls `deleteObject`

---

## Frontend

### New file: `frontend/src/components/jobs/JobPhotos.tsx`

A reusable component used in both technician and office views.

Props:
```typescript
interface JobPhotosProps {
  jobId: string
  photos: string[]
  canUpload: boolean           // true for technician, false for office
  onPhotosChange?: (photos: string[]) => void  // called after upload or delete
}
```

Behavior:
- Renders a grid of photo thumbnails (`object-cover`, `aspect-square`, rounded corners)
- If `canUpload`: shows an "Add Photo" button (or + cell in the grid)
  - On click: opens native file picker (`<input type="file" accept="image/*" multiple>`)
  - For each selected file: `POST /api/jobs/{jobId}/photos/upload-url` → `PUT` to presigned URL → `POST /api/jobs/{jobId}/photos`
  - Uploads run sequentially (not parallel) to avoid overwhelming mobile connections
  - Shows per-photo upload progress: spinner overlay on the + cell while uploading
  - On success: calls `onPhotosChange` with updated photos array
  - On error: toast("Upload failed") via sonner
- Photo thumbnails are clickable — opens a simple lightbox (full-size `<img>` in a Dialog overlay)
- If `canUpload`: each thumbnail has a trash icon on hover that calls `DELETE /api/jobs/{jobId}/photos`
- If S3 is unavailable (503 from upload-url): shows a "Photo upload unavailable" message; existing photos still render

Error states:
- 503 (S3 not configured): "Photo upload unavailable" — show warning, existing photos still display
- File too large (>10 MB, checked client-side before upload): toast("File too large — max 10 MB")
- Wrong type (checked client-side): toast("Only images are supported")
- Network error mid-upload: toast("Upload failed — please try again")

### Modified file: `frontend/src/pages/technician/TechnicianJobs.tsx`

Add a "Photos" section to the active job detail view, using `<JobPhotos canUpload={true} />`. Placed below the existing job info cards and above (or alongside) the AI chat panel.

When photos change, update local job state so the grid reflects the new count without a full refetch.

### Modified file: `frontend/src/components/jobs/completion-dialog.tsx`

Replace the current base64 photo handling:
- Remove `photos` state (base64 array), `handlePhotoFiles`, `removePhoto`
- Replace with `<JobPhotos canUpload={true} />` embedded in the dialog
- Photos uploaded here persist on the job immediately (not deferred to form submit)
- Remove `photos` from the completion PATCH body (they're already on the job)

### Modified file: `frontend/src/pages/office/OfficeJobs.tsx`

Add a "Photos" tab or section to the job detail panel (alongside existing Details/Invoice), using `<JobPhotos canUpload={false} />`. Shows photo count in the tab label: "Photos (3)".

### Modified file: `frontend/src/api/types.ts`

`ApiJob` already has `photos: string[]` — no change needed.

Add:
```typescript
export interface PhotoUploadUrlResponse {
  uploadUrl: string
  publicUrl: string
}
```

---

## Error States

| Condition | Behaviour |
|---|---|
| `AWS_S3_BUCKET` not set | `s3Available()` returns false; upload-url returns 503; UI shows "Photo upload unavailable" |
| File >10 MB | Client-side check before upload; toast error |
| Non-image file type | Client-side check; toast error |
| S3 PUT fails | Toast error; URL not registered (POST /photos never called) |
| URL injection attempt | Backend validates URL starts with expected S3 domain; returns 400 |
| Office staff tries to upload | Route returns 403; UI never shows upload button for office role |

---

## Out of Scope

- Customer-facing photo view
- PDF reports with embedded photos
- Video upload
- Photo captions or annotations
- Per-photo uploader attribution
- Image compression or resizing (handled by S3/CDN layer if needed later)
- Camera capture on desktop (native file picker handles this on mobile)
