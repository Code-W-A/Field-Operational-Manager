"use client"

import { useRef, useEffect, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SignaturePadProps {
  onSave: (signature: string) => void
  initialSignature?: string
  className?: string
  height?: number
  width?: number
  disabled?: boolean
}

export function SignaturePad({
  onSave,
  initialSignature,
  className,
  height = 200,
  width = 500,
  disabled = false,
}: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    if (initialSignature && sigCanvas.current) {
      sigCanvas.current.fromDataURL(initialSignature)
      setIsEmpty(false)
    }
  }, [initialSignature])

  const clear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear()
      setIsEmpty(true)
      onSave("")
    }
  }

  const save = () => {
    if (sigCanvas.current) {
      const dataURL = sigCanvas.current.toDataURL("image/png")
      onSave(dataURL)
    }
  }

  const handleEnd = () => {
    if (sigCanvas.current) {
      setIsEmpty(sigCanvas.current.isEmpty())
      if (!sigCanvas.current.isEmpty()) {
        save()
      }
    }
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("border border-gray-300 rounded-md mb-2", disabled && "opacity-50 cursor-not-allowed")}>
        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          canvasProps={{
            width: width,
            height: height,
            className: "signature-canvas",
          }}
          onEnd={handleEnd}
          disabled={disabled}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={clear} disabled={isEmpty || disabled} size="sm">
          Șterge
        </Button>
      </div>
    </div>
  )
}
