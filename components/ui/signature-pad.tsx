"use client"

import type React from "react"

import { SignaturePad as OriginalSignaturePad } from "@/components/signature-pad"

// Re-export the SignaturePad component as the default export
export default function SignaturePad(props: React.ComponentProps<typeof OriginalSignaturePad>) {
  return <OriginalSignaturePad {...props} />
}

// Also export as a named export for flexibility
export { SignaturePad }
