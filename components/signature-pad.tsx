"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useStableCallback } from "@/lib/utils/hooks"

interface SignaturePadProps {
  onSave: (signatureData: string) => void
  existingSignature?: string
  title?: string
}

export function SignaturePad({ onSave, existingSignature, title = "Semnătură" }: SignaturePadProps) {
  const signatureRef = useRef<SignatureCanvas | null>(null)
  const [isSigned, setIsSigned] = useState(false)
  const [showExisting, setShowExisting] = useState(!!existingSignature)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  // Use useEffect with proper dependency array instead of useEffectEvent
  useEffect(() => {
    setShowExisting(!!existingSignature)
  }, [existingSignature])

  const clearSignature = useCallback(() => {
    if (signatureRef.current) {
      signatureRef.current.clear()
      setIsSigned(false)
      setSignatureData(null)
    }
  }, [])

  // Use useStableCallback to ensure we have access to the latest state and refs
  const handleSave = useStableCallback(() => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      const data = signatureRef.current.toDataURL()
      setSignatureData(data)
      onSave(data)
      setShowExisting(true)
    }
  })

  const handleNewSignature = useCallback(() => {
    setShowExisting(false)
    clearSignature()
  }, [clearSignature])

  // Handle start of drawing
  const handleBegin = useCallback(() => {
    setIsDrawing(true)
  }, [])

  // Handle end of drawing
  const handleEnd = useCallback(() => {
    setIsDrawing(false)
    if (signatureRef.current) {
      const isEmpty = signatureRef.current.isEmpty()
      setIsSigned(!isEmpty)

      if (!isEmpty) {
        // Immediately store the signature data when drawing ends
        const data = signatureRef.current.toDataURL()
        setSignatureData(data)
      }
    }
  }, [])

  // Add a document-wide click handler to restore signature if it gets cleared
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      // Skip if we're currently drawing or if there's no signature data
      if (isDrawing || !signatureData || showExisting) return

      // Small delay to let other events process
      setTimeout(() => {
        // If the canvas is now empty but we have signature data, restore it
        if (signatureRef.current && signatureRef.current.isEmpty() && signatureData) {
          signatureRef.current.fromDataURL(signatureData)
          setIsSigned(true)
        }
      }, 100)
    }

    document.addEventListener("click", handleDocumentClick)
    document.addEventListener("touchend", handleDocumentClick)

    return () => {
      document.removeEventListener("click", handleDocumentClick)
      document.removeEventListener("touchend", handleDocumentClick)
    }
  }, [signatureData, isDrawing, showExisting])

  // Restore signature from state when component mounts or signatureData changes
  useEffect(() => {
    if (!showExisting && signatureData && signatureRef.current && signatureRef.current.isEmpty()) {
      const timer = setTimeout(() => {
        if (signatureRef.current) {
          signatureRef.current.fromDataURL(signatureData)
          setIsSigned(true)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [showExisting, signatureData])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {showExisting && existingSignature ? (
          <div className="flex flex-col items-center">
            <img
              src={existingSignature || "/placeholder.svg"}
              alt="Semnătură existentă"
              className="border rounded max-w-full h-auto"
            />
            <Button variant="outline" size="sm" className="mt-2" onClick={handleNewSignature}>
              Semnează din nou
            </Button>
          </div>
        ) : (
          <div className="border rounded p-1 bg-white">
            <SignatureCanvas
              ref={(ref) => (signatureRef.current = ref)}
              canvasProps={{
                className: "w-full h-40 border rounded",
                style: { width: "100%", height: "160px" },
              }}
              onBegin={handleBegin}
              onEnd={handleEnd}
            />
          </div>
        )}
      </CardContent>
      {!showExisting && (
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={clearSignature}>
            Șterge
          </Button>
          <Button onClick={handleSave} disabled={!isSigned}>
            Salvează semnătura
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
