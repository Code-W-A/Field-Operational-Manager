"use client"

import { useEffect, useState, useRef } from "react"

/**
 * Custom hook to lock the body scroll when a modal is open
 * and properly clean up when the modal is closed
 */
export function useLockBody() {
  const [originalStyle, setOriginalStyle] = useState("")
  const [originalPointerEvents, setOriginalPointerEvents] = useState("")
  const cleanup = useRef<() => void>()

  useEffect(() => {
    // Save the original body styles
    setOriginalStyle(document.body.style.overflow)
    setOriginalPointerEvents(document.body.style.pointerEvents)

    // Lock body scroll
    document.body.style.overflow = "hidden"

    // Add a class to indicate modal is open
    document.documentElement.classList.add("modal-open")

    // Define cleanup function
    cleanup.current = () => {
      // Restore original body styles
      document.body.style.overflow = originalStyle
      document.body.style.pointerEvents = originalPointerEvents

      // Remove the modal open class
      document.documentElement.classList.remove("modal-open")

      // Force a reflow to ensure all event listeners are properly cleaned up
      window.setTimeout(() => {
        const forceReflow = document.body.offsetHeight
      }, 10)
    }

    // Cleanup function
    return () => {
      if (cleanup.current) {
        cleanup.current()
      }

      // Additional safety measure - ensure body scroll is restored
      // even if the component unmounts unexpectedly
      document.body.style.overflow = ""
      document.body.style.pointerEvents = ""
      document.documentElement.classList.remove("modal-open")
    }
  }, [])

  // Expose a manual cleanup method that can be called
  return {
    unlockBody: () => {
      if (cleanup.current) {
        cleanup.current()
      }
    },
  }
}
