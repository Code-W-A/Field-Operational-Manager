"use client"

import { useCallback, useRef } from "react"

/**
 * A utility function that creates a stable callback that can be used in place of useEffectEvent
 * This ensures the callback doesn't cause unnecessary re-renders while still having access to fresh props/state
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback)

  // Update the ref whenever the callback changes
  callbackRef.current = callback

  // Return a stable function that calls the latest callback
  return useCallback(((...args) => callbackRef.current(...args)) as T, [])
}
