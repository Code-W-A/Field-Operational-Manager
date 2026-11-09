"use client"

import * as React from "react"

// Keep touch/mobile dialogs modal; desktop windows may be moved and leave the page usable.
export function useFloatingDialog(open: boolean) {
  const [enabled, setEnabled] = React.useState(false)
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null)
  const drag = React.useRef<{ x: number; y: number; left: number; top: number; width: number } | null>(null)

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 768px) and (pointer: fine)")
    const update = () => setEnabled(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    if (!open || !enabled) {
      setPosition(null)
      drag.current = null
    }
  }, [open, enabled])

  React.useEffect(() => {
    if (!enabled) return
    const move = (event: PointerEvent) => {
      const current = drag.current
      if (!current) return
      const width = window.innerWidth
      setPosition({
        x: Math.min(width - current.width / 2 - 8, Math.max(48 - current.width / 2, current.left + event.clientX - current.x)),
        y: Math.min(window.innerHeight - 48, Math.max(0, current.top + event.clientY - current.y)),
      })
    }
    const stop = () => { drag.current = null }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [enabled])

  const onPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.pointerType !== "mouse" || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest("button, input, textarea, select, a, [role='button'], [data-no-dialog-drag]")) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientY - rect.top > 60) return
    // Position is stored as the horizontal centre and the upper edge of the window.
    drag.current = { x: event.clientX, y: event.clientY, left: rect.left + rect.width / 2, top: rect.top, width: rect.width }
    event.preventDefault()
  }

  return {
    enabled,
    contentProps: {
      floating: enabled,
      onPointerDownCapture,
      style: position && enabled
        ? { left: position.x, top: position.y, transform: "translateX(-50%)" }
        : undefined,
    },
  }
}
