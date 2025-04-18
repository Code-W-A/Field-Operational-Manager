"use client"

import type React from "react"

import { useRef, useState, useCallback } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"

interface SignaturePadProps {
  onSave: (signature: string) => void
  label?: string
  signatureRef?: React.MutableRefObject<SignatureCanvas | null>
  onSignatureChange?: (isEmpty: boolean) => void
}

export function SignaturePad({ onSave, label = "Semnătură", signatureRef, onSignatureChange }: SignaturePadProps) {
  const internalSignatureRef = useRef<SignatureCanvas | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const sigRef = signatureRef || internalSignatureRef

  const handleClear = useCallback(() => {
    if (sigRef.current) {
      sigRef.current.clear()
      setIsEmpty(true)
      if (onSignatureChange) {
        onSignatureChange(true)
      }
    }
  }, [sigRef, onSignatureChange])

  const handleSave = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const signatureData = sigRef.current.toDataURL("image/png")
      onSave(signatureData)
    }
  }, [sigRef, onSave])

  const handleEnd = useCallback(() => {
    if (sigRef.current) {
      const newIsEmpty = sigRef.current.isEmpty()
      setIsEmpty(newIsEmpty)
      if (onSignatureChange) {
        onSignatureChange(newIsEmpty)
      }
    }
  }, [sigRef, onSignatureChange])

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="rounded-md border border-gray-300 bg-white p-2">
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            className: "w-full h-40 border rounded",
            style: { width: "100%", height: "160px" },
          }}
          onEnd={handleEnd}
        />
      </div>
      <div className="flex justify-end space-x-2">
        <Button variant="outline" size="sm" onClick={handleClear}>
          Șterge
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isEmpty}>
          Salvează
        </Button>
      </div>
    </div>
  )
}
