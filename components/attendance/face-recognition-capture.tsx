"use client"

import { useState, useEffect } from "react"
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
}

type ProcessingState = "idle" | "capturing" | "processing" | "success" | "error"

export function FaceRecognitionCapture({
  onSuccess,
  onError,
  userId,
  userName,
  autoStart = false,
}: FaceRecognitionCaptureProps) {
  const [state, setState] = useState<ProcessingState>("idle")
  const [result, setResult] = useState<FaceRecognitionResult | null>(null)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (autoStart) {
      startRecognition()
    }
  }, [autoStart])

  const startRecognition = async () => {
    // Countdown before capture
    setState("capturing")
    
    for (let i = 3; i > 0; i--) {
      setCountdown(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Start processing
    setState("processing")

    try {
      const recognitionResult = userId && userName
        ? await recognizeFaceForUser(userId, userName)
        : await recognizeFace()

      setResult(recognitionResult)

      if (recognitionResult.success) {
        setState("success")
        setTimeout(() => {
          onSuccess(recognitionResult)
        }, 1000)
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
        {/* Mock Camera Preview */}
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
            {userName ? `Pregătit să scaneze pentru ${userName}` : "Pregătit pentru scanare facială"}
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
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
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
