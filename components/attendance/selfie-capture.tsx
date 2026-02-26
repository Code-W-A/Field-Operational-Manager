"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SelfieCaptureStatus = "idle" | "streaming" | "capturing" | "success" | "error"
const CAMERA_PERMISSION_CACHE_KEY = "attendance.cameraPermissionGranted"

export interface SelfieCaptureResult {
  ok: boolean
  blob?: Blob
  mimeType?: string
  error?: string
  code?: "permission_denied" | "unavailable" | "capture_failed"
}

export function SelfieCapture({
  onCaptured,
  onSkip,
  allowSkip = true,
  autoStart = true,
  autoCaptureDelayMs,
  showManualControls = true,
  className,
}: {
  onCaptured: (result: SelfieCaptureResult) => void
  onSkip?: () => void
  allowSkip?: boolean
  autoStart?: boolean
  autoCaptureDelayMs?: number
  showManualControls?: boolean
  className?: string
}) {
  const [status, setStatus] = useState<SelfieCaptureStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const autoCaptureTimerRef = useRef<number | null>(null)
  const hadGrantedPermissionRef = useRef(false)

  const canUseCamera = useMemo(() => {
    return typeof window !== "undefined" && Boolean(navigator?.mediaDevices?.getUserMedia)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      hadGrantedPermissionRef.current = localStorage.getItem(CAMERA_PERMISSION_CACHE_KEY) === "1"
    } catch {
      hadGrantedPermissionRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!autoStart) return
    void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    return () => {
      if (autoCaptureTimerRef.current) window.clearTimeout(autoCaptureTimerRef.current)
      stop()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (autoCaptureTimerRef.current) {
      window.clearTimeout(autoCaptureTimerRef.current)
      autoCaptureTimerRef.current = null
    }
    if (status !== "streaming") return
    if (!Number.isFinite(Number(autoCaptureDelayMs)) || Number(autoCaptureDelayMs) <= 0) return
    autoCaptureTimerRef.current = window.setTimeout(() => {
      void capture()
    }, Number(autoCaptureDelayMs))
    return () => {
      if (autoCaptureTimerRef.current) {
        window.clearTimeout(autoCaptureTimerRef.current)
        autoCaptureTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoCaptureDelayMs])

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
      const msg = "Camera nu este disponibilă pe acest dispozitiv/browser."
      setError(msg)
      onCaptured({ ok: false, error: msg, code: "unavailable" })
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
      try {
        localStorage.setItem(CAMERA_PERMISSION_CACHE_KEY, "1")
      } catch {
        // ignore
      }
      hadGrantedPermissionRef.current = true
    } catch (e) {
      setStatus("error")
      const rawMsg = e instanceof Error ? e.message : "Nu am putut accesa camera."
      const isDenied =
        String((e as any)?.name || "").toLowerCase() === "notallowederror" ||
        rawMsg.toLowerCase().includes("permission") ||
        rawMsg.toLowerCase().includes("denied") ||
        rawMsg.toLowerCase().includes("not allowed")
      const msg = isDenied
        ? "Permisiunea camerei a fost refuzată. Poți continua fără selfie."
        : rawMsg
      setError(msg)
      onCaptured({ ok: false, error: msg, code: isDenied ? "permission_denied" : "unavailable" })
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
        const msg = "Nu am putut genera imaginea (blob)."
        setError(msg)
        onCaptured({ ok: false, error: msg, code: "capture_failed" })
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
      onCaptured({ ok: false, error: msg, code: "capture_failed" })
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

        {(showManualControls || status === "error" || (allowSkip && onSkip)) ? (
          <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
            {showManualControls ? (
              <Button
                type="button"
                onClick={() => void capture()}
                disabled={status === "capturing" || status === "error" || status === "success"}
                className="min-w-[160px]"
              >
                {status === "capturing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Fă selfie
              </Button>
            ) : null}
            {(showManualControls || status === "error") ? (
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
            ) : null}
            {allowSkip && onSkip && (showManualControls || status === "error") ? (
              <Button type="button" variant="secondary" onClick={onSkip} className="min-w-[160px]">
                Continuă fără selfie
              </Button>
            ) : null}
          </div>
        ) : null}

        {error && status !== "error" && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  )
}

