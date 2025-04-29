"use client"

import { useEffect, useState } from "react"

/**
 * Custom hook to lock the body scroll when a modal is open
 * and properly clean up when the modal is closed
 */
export function useLockBody() {
  const [originalStyle, setOriginalStyle] = useState("")

  useEffect(() => {
    // Save the original body style
    setOriginalStyle(window.getComputedStyle(document.body).overflow)

    // Lock body scroll
    document.body.style.overflow = "hidden"

    // Add a class to indicate modal is open
    document.documentElement.classList.add("modal-open")

    // Cleanup function
    return () => {
      // Restore original body style
      document.body.style.overflow = originalStyle

      // Remove the modal open class
      document.documentElement.classList.remove("modal-open")

      // Force a reflow to ensure all event listeners are properly cleaned up
      window.setTimeout(() => {
        const forceReflow = document.body.offsetHeight
      }, 10)
    }
  }, [])
}
