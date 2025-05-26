"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input" // Fixed import from input.tsx instead of form.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { QrCode, Camera, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useStableCallback } from "@/lib/utils/hooks"

interface QRCodeScannerProps {
  onScan: (data: string) => void
  title?: string
  description?: string
  buttonText?: string
  cancelButtonText?: string
  onCancel?: () => void
  showManualInput?: boolean
  manualInputLabel?: string
  manualInputPlaceholder?: string
  manualInputButtonText?: string
}

export function QRCodeScanner({
  onScan,
  title = "Scanare cod QR",
  description = "Scanați codul QR pentru a continua",
  buttonText = "Scanează",
  cancelButtonText = "Anulează",
  onCancel,
  showManualInput = true,
  manualInputLabel = "Sau introduceți codul manual",
  manualInputPlaceholder = "Introduceți codul...",
  manualInputButtonText = "Trimite",
}: QRCodeScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const router = useRouter()

  const stopScanning = useStableCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }

    setScanning(false)
  })

  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [stopScanning])

  const startScanning = async () => {
    setError(null)
    setScanning(true)

    try {
      const constraints = {
        video: {
          facingMode: "environment",
        },
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(mediaStream)

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        videoRef.current.play()
      }

      scanQRCode()
    } catch (err) {
      console.error("Error accessing camera:", err)
      setError("Nu s-a putut accesa camera. Verificați permisiunile și încercați din nou.")
      setScanning(false)
    }
  }

  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext("2d")

    if (!context) return

    const scanFrame = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight
        canvas.width = video.videoWidth

        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

        try {
          // Here you would normally use a QR code scanning library
          // For this example, we'll simulate finding a QR code after a delay
          setTimeout(() => {
            // Simulate QR code detection
            const simulatedQRCode = "simulated-qr-code-" + Math.floor(Math.random() * 1000)
            handleQRCodeDetected(simulatedQRCode)
          }, 2000)
        } catch (error) {
          console.error("QR code scanning error:", error)
        }
      }

      animationRef.current = requestAnimationFrame(scanFrame)
    }

    animationRef.current = requestAnimationFrame(scanFrame)
  }

  const handleQRCodeDetected = (data: string) => {
    stopScanning()
    onScan(data)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      onScan(manualCode.trim())
    } else {
      toast({
        title: "Eroare",
        description: "Vă rugăm să introduceți un cod valid.",
        variant: "destructive",
      })
    }
  }

  const handleCancel = () => {
    stopScanning()
    if (onCancel) {
      onCancel()
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scanning ? (
          <div className="relative">
            <video ref={videoRef} className="w-full h-64 bg-black rounded-md object-cover" playsInline muted></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white rounded-md"></div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-2 bg-white/80 hover:bg-white"
              onClick={stopScanning}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-md p-4">
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <>
                <QrCode className="h-12 w-12 mb-4 text-gray-400" />
                <p className="text-sm text-gray-500 text-center mb-4">
                  Apăsați butonul de mai jos pentru a scana un cod QR
                </p>
                <Button onClick={startScanning} className="flex items-center">
                  <Camera className="mr-2 h-4 w-4" />
                  {buttonText}
                </Button>
              </>
            )}
          </div>
        )}

        {showManualInput && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">{manualInputLabel}</h3>
            <form onSubmit={handleManualSubmit} className="flex space-x-2">
              <Input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={manualInputPlaceholder}
                className="flex-1"
              />
              <Button type="submit">{manualInputButtonText}</Button>
            </form>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        {onCancel && (
          <Button variant="outline" onClick={handleCancel}>
            {cancelButtonText}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
