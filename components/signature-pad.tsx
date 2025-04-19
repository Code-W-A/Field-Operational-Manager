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

  // Use useEffect with proper dependency array instead of useEffectEvent
  useEffect(() => {
    setShowExisting(!!existingSignature)
  }, [existingSignature])

  const clearSignature = useCallback(() => {
    if (signatureRef.current) {
      signatureRef.current.clear()
      setIsSigned(false)
    }
  }, [])

  // Use useStableCallback to ensure we have access to the latest state and refs
  const handleSave = useStableCallback(() => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      const signatureData = signatureRef.current.toDataURL()
      onSave(signatureData)
      setShowExisting(true)
    }
  })

  const handleNewSignature = useCallback(() => {
    setShowExisting(false)
    clearSignature()
  }, [clearSignature])

  const handleSignatureEnd = useCallback(() => {
    setIsSigned(!signatureRef.current?.isEmpty())
  }, [])

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
              onEnd={handleSignatureEnd}
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
