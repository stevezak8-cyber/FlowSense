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

    // Upload directly to S3 — presigned URL handles auth, no Authorization header
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
    let currentPhotos = [...photos]

    for (const file of Array.from(files)) {
      const publicUrl = await uploadFile(file)
      if (!publicUrl) continue

      try {
        const result = await api.post<{ photos: string[] }>(`/api/jobs/${jobId}/photos`, {
          url: publicUrl,
        })
        currentPhotos = result.photos
      } catch {
        toast.error("Upload failed — please try again")
      }
    }

    onPhotosChange?.(currentPhotos)
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
