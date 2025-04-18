"use client"

Object.defineProperty(exports, "__esModule", { value: true })

var React = require("react")

/**
 * A React hook that provides a way to use callback refs with cleanup.
 */
function useCallbackRef(callback) {
  const callbackRef = React.useRef(callback)

  React.useEffect(() => {
    callbackRef.current = callback
  })

  return React.useCallback((...args) => {
    return callbackRef.current?.(...args)
  }, [])
}

// Export useCallbackRef as useEffectEvent to maintain compatibility
const useEffectEvent = useCallbackRef

exports.useEffectEvent = useEffectEvent
