"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { recognizeFace, recognizeFaceForUser } from "@/lib/face-recognition/mock-service"
import type { FaceRecognitionResult } from "@/types/attendance"
import { cn } from "@/lib/utils"

export interface FaceRecognitionCaptureProps {
  onSuccess: (result: FaceRecognitionResult) => void
  onError: (error: string) => void
  userId?: string // For kiosk mode with specific user
  userName?: string
  autoStart?: boolean
  implementation?: "mock" | "camera"
}

type ProcessingState = "idle" | "capturing" | "processing" | "success" | "error"

export function FaceRecognitionCapture({
  onSuccess,
  onError,
  userId,
  userName,
  autoStart = false,
  implementation = "mock",
}: FaceRecognitionCaptureProps) {
  const [state, setState] = useState<ProcessingState>("idle")
  const [result, setResult] = useState<FaceRecognitionResult | null>(null)
  const [countdown, setCountdown] = useState(3)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const canUseCamera = implementation === "camera"

  const hasFaceDetector = useMemo(() => {
    return typeof window !== "undefined" && typeof (window as any).FaceDetector === "function"
  }, [])

  useEffect(() => {
    if (autoStart) {
      startRecognition()
    }
  }, [autoStart])

  useEffect(() => {
    // Cleanup camera stream on unmount or when switching away from camera mode.
    return () => {
      try {
        streamRef.current?.getTracks?.().forEach((t) => t.stop())
      } catch {}
      streamRef.current = null
    }
  }, [])

  const ensureCameraStream = async () => {
    if (!canUseCamera) return
    if (streamRef.current) return

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera nu este disponibilă în acest browser.")
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    })
    streamRef.current = stream

    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    await new Promise<void>((resolve) => {
      const onReady = () => resolve()
      if (video.readyState >= 2) return resolve()
      video.onloadedmetadata = onReady
    })
    await video.play()
  }

  const stopCameraStream = () => {
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop())
    } catch {}
    streamRef.current = null
  }

  const detectSingleFace = async (width: number, height: number) => {
    if (!hasFaceDetector) {
      throw new Error("Detectarea facială nu este suportată pe acest browser. Folosește Chrome/Edge.")
    }
    const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 2 })
    const canvas = canvasRef.current
    if (!canvas) throw new Error("Nu pot accesa camera (canvas lipsă).")
    const faces = await detector.detect(canvas)
    if (!Array.isArray(faces) || faces.length === 0) {
      return { ok: false, confidence: 0 }
    }
    if (faces.length > 1) {
      return { ok: false, confidence: 0 }
    }
    const box = faces[0]?.boundingBox
    const area = (box?.width || 0) * (box?.height || 0)
    const ratio = area / Math.max(1, width * height)
    // Minimal heuristics: face must occupy a reasonable portion of the frame.
    const ok = ratio >= 0.03
    const confidence = Math.max(0, Math.min(1, ratio / 0.15)) // normalize roughly
    return { ok, confidence }
  }

  const startRecognition = async () => {
    setCameraError(null)
    if (canUseCamera) {
      if (!hasFaceDetector) {
        const msg = "Browserul tău nu suportă detectare facială. Folosește Chrome/Edge."
        setCameraError(msg)
        setState("error")
        onError(msg)
        setTimeout(() => setState("idle"), 2000)
        return
      }
      try {
        await ensureCameraStream()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Nu am putut accesa camera."
        setCameraError(msg)
        setState("error")
        onError(msg)
        // Auto-retry after 2 seconds
        setTimeout(() => setState("idle"), 2000)
        return
      }
    }

    // Countdown before capture
    setState("capturing")
    
    for (let i = 3; i > 0; i--) {
      setCountdown(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Start processing
    setState("processing")

    try {
      const recognitionResult: FaceRecognitionResult = await (async () => {
        if (!canUseCamera) {
          return userId && userName ? await recognizeFaceForUser(userId, userName) : await recognizeFace()
        }

        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) throw new Error("Nu pot accesa camera.")
        const width = Math.max(1, video.videoWidth || 640)
        const height = Math.max(1, video.videoHeight || 480)
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Nu pot captura imaginea.")
        ctx.drawImage(video, 0, 0, width, height)

        const t0 = Date.now()
        const face = await detectSingleFace(width, height)
        const t1 = Date.now()
        if (!face.ok) {
          return {
            success: false,
            error: "Nu am detectat fața clar. Apropie-te puțin și privește spre cameră.",
            processingTime: t1 - t0,
          }
        }

        const uid = userId || "anon"
        return {
          success: true,
          confidence: face.confidence,
          faceId: `face_cam_${uid}_${Date.now()}`,
          processingTime: t1 - t0,
        }
      })()

      setResult(recognitionResult)

      if (recognitionResult.success) {
        setState("success")
        setTimeout(() => {
          onSuccess(recognitionResult)
        }, 1000)
        // Stop camera after success to release hardware.
        if (canUseCamera) stopCameraStream()
      } else {
        setState("error")
        onError(recognitionResult.error || "Recognition failed")
        
        // Auto-retry after 2 seconds
        setTimeout(() => {
          setState("idle")
        }, 2000)
      }
    } catch (error) {
      setState("error")
      const errorMessage = error instanceof Error ? error.message : "Recognition failed"
      onError(errorMessage)
      
      // Auto-retry after 2 seconds
      setTimeout(() => {
        setState("idle")
      }, 2000)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      {/* Camera Preview Area */}
      <div className={cn(
        "relative w-64 h-64 rounded-2xl overflow-hidden border-4 transition-all duration-300",
        state === "success" ? "border-emerald-500" : 
        state === "error" ? "border-red-500" : 
        state === "processing" || state === "capturing" ? "border-blue-500 animate-pulse" :
        "border-gray-300"
      )}>
        {canUseCamera ? (
          <div className="w-full h-full bg-black">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
            {/* Hidden canvas used for snapshot + detection (no persistence) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay states */}
            {state === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Camera className="w-20 h-20 text-white/60" />
              </div>
            )}

            {state === "capturing" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="flex flex-col items-center gap-4">
                  <Camera className="w-20 h-20 text-blue-300 animate-bounce" />
                  <div className="text-6xl font-bold text-white">{countdown}</div>
                </div>
              </div>
            )}

            {state === "processing" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-20 h-20 text-blue-300 animate-spin" />
                  <div className="text-sm text-white">Analizăm…</div>
                </div>
              </div>
            )}

            {state === "success" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-20 h-20 text-emerald-300" />
                  <div className="text-sm text-white font-semibold">OK</div>
                </div>
              </div>
            )}

            {state === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                  <XCircle className="w-20 h-20 text-red-300" />
                  <div className="text-sm text-white font-semibold">Eroare</div>
                  <div className="text-xs text-red-200 text-center px-4">
                    {cameraError || result?.error || "Încercă din nou"}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Mock Camera Preview */
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            {state === "idle" && (
              <Camera className="w-20 h-20 text-gray-600" />
            )}
            
            {state === "capturing" && (
              <div className="flex flex-col items-center gap-4">
                <Camera className="w-20 h-20 text-blue-400 animate-bounce" />
                <div className="text-6xl font-bold text-white">{countdown}</div>
              </div>
            )}
            
            {state === "processing" && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-20 h-20 text-blue-400 animate-spin" />
                <div className="text-sm text-white">Procesează...</div>
              </div>
            )}
            
            {state === "success" && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-20 h-20 text-emerald-400" />
                <div className="text-sm text-white font-semibold">Recunoscut!</div>
                {result?.confidence && (
                  <div className="text-xs text-emerald-300">
                    Confidence: {(result.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}
            
            {state === "error" && (
              <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                <XCircle className="w-20 h-20 text-red-400" />
                <div className="text-sm text-white font-semibold">Eroare</div>
                <div className="text-xs text-red-300 text-center px-4">
                  {result?.error || "Încercă din nou"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Face Detection Overlay (when processing) */}
        {(state === "processing" || state === "success") && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={cn(
              "w-48 h-56 border-2 rounded-lg",
              state === "success" ? "border-emerald-400" : "border-blue-400"
            )} style={{
              borderStyle: "dashed",
              animation: state === "processing" ? "pulse 2s ease-in-out infinite" : "none"
            }} />
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="text-center space-y-2">
        {state === "idle" && (
          <p className="text-sm text-muted-foreground">
            {canUseCamera && !hasFaceDetector
              ? "Browserul tău nu suportă detectare facială. Folosește Chrome/Edge."
              : (userName ? `Pregătit să scaneze pentru ${userName}` : "Pregătit pentru scanare facială")}
          </p>
        )}
        {state === "capturing" && (
          <p className="text-sm text-blue-600 font-semibold animate-pulse">
            Pregătește-te să fii scanat...
          </p>
        )}
        {state === "processing" && (
          <p className="text-sm text-blue-600 font-semibold">
            Analizăm imaginea...
          </p>
        )}
        {state === "success" && (
          <p className="text-sm text-emerald-600 font-semibold">
            Succes! Redirecționăm...
          </p>
        )}
        {state === "error" && (
          <p className="text-sm text-red-600 font-semibold">
            Se reîncearcă automat...
          </p>
        )}
      </div>

      {/* Start Button (only show when idle) */}
      {!autoStart && state === "idle" && (
        <button
          onClick={startRecognition}
          disabled={canUseCamera && !hasFaceDetector}
          className={cn(
            "px-8 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2",
            canUseCamera && !hasFaceDetector
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          )}
        >
          <Camera className="w-5 h-5" />
          Pornește Scanarea
        </button>
      )}

      {/* Processing Time (when completed) */}
      {(state === "success" || state === "error") && result?.processingTime && (
        <div className="text-xs text-muted-foreground">
          Timp procesare: {(result.processingTime / 1000).toFixed(2)}s
        </div>
      )}
    </div>
  )
}
