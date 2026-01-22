"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SelfieCaptureStatus = "idle" | "streaming" | "capturing" | "success" | "error"

export interface SelfieCaptureResult {
  ok: boolean
  blob?: Blob
  mimeType?: string
  error?: string
}

export function SelfieCapture({
  onCaptured,
  onSkip,
  autoStart = true,
  className,
}: {
  onCaptured: (result: SelfieCaptureResult) => void
  onSkip: () => void
  autoStart?: boolean
  className?: string
}) {
  const [status, setStatus] = useState<SelfieCaptureStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const canUseCamera = useMemo(() => {
    return typeof window !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia)
  }, [])

  useEffect(() => {
    if (!autoStart) return
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    return () => {
      stop()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop())
    } catch {}
    streamRef.current = null
    setStatus((s) => (s === "success" ? "success" : "idle"))
  }

  const start = async () => {
    setError(null)
    if (!canUseCamera) {
      setStatus("error")
      setError("Camera nu este disponibilă pe acest dispozitiv/browser.")
      return
    }
    try {
      setStatus("streaming")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await new Promise<void>((resolve) => {
          const onReady = () => resolve()
          if (video.readyState >= 2) return resolve()
          video.onloadedmetadata = onReady
        })
        await video.play()
      }
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "Nu am putut accesa camera.")
    }
  }

  const capture = async () => {
    setError(null)
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      setStatus("error")
      setError("Camera nu este pregătită.")
      return
    }
    const width = Math.max(1, video.videoWidth || 640)
    const height = Math.max(1, video.videoHeight || 480)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setStatus("error")
      setError("Nu pot captura imaginea.")
      return
    }
    try {
      setStatus("capturing")
      ctx.drawImage(video, 0, 0, width, height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
      if (!blob) {
        setStatus("error")
        setError("Nu am putut genera imaginea (blob).")
        return
      }
      // preview
      try {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
      } catch {}
      setStatus("success")
      // stop camera to release hardware
      stop()
      onCaptured({ ok: true, blob, mimeType: "image/jpeg" })
    } catch (e) {
      setStatus("error")
      const msg = e instanceof Error ? e.message : "Eroare la captură."
      setError(msg)
      onCaptured({ ok: false, error: msg })
    }
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className={cn("relative w-64 h-64 rounded-2xl overflow-hidden border-4 bg-black/5", status === "error" ? "border-red-500" : status === "success" ? "border-emerald-500" : "border-gray-300")}>
          {previewUrl ? (
            <img src={previewUrl} alt="Selfie" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {(status === "idle" || status === "streaming") && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Camera className="h-16 w-16 text-white/70" />
                </div>
              )}
              {status === "capturing" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-16 w-16 text-white animate-spin" />
                </div>
              )}
            </>
          )}

          {status === "success" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
              <CheckCircle2 className="h-16 w-16 text-emerald-200" />
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 gap-2 p-3 text-center">
              <AlertCircle className="h-12 w-12 text-red-200" />
              <div className="text-sm text-white">{error || "Eroare camera."}</div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
          <Button
            type="button"
            onClick={() => void capture()}
            disabled={status === "capturing" || status === "error" || status === "success"}
            className="min-w-[160px]"
          >
            {status === "capturing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Fă selfie
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void start()}
            disabled={status === "capturing"}
            className="min-w-[160px]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Repornește camera
          </Button>
          <Button type="button" variant="secondary" onClick={onSkip} className="min-w-[160px]">
            Continuă fără selfie
          </Button>
        </div>

        {error && status !== "error" && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  )
}

