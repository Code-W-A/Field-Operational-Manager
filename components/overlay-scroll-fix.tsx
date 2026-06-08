"use client"

import { useEffect } from "react"
import { applyOverlayWheelScroll } from "@/lib/overlay-scroll"

export function OverlayScrollFix() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      applyOverlayWheelScroll(event)
    }

    document.addEventListener("wheel", onWheel, { capture: true, passive: false })
    return () => document.removeEventListener("wheel", onWheel, { capture: true })
  }, [])

  return null
}
