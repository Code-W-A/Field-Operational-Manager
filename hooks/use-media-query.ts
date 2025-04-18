"use client"

import { useState, useEffect } from "react"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)

    // Actualizăm starea inițială
    if (media.matches !== matches) {
      setMatches(media.matches)
    }

    // Callback pentru schimbări
    const listener = () => {
      setMatches(media.matches)
    }

    // Adăugăm listener
    media.addEventListener("change", listener)

    // Curățăm listener-ul la unmount
    return () => {
      media.removeEventListener("change", listener)
    }
  }, [matches, query])

  return matches
}
