/** Click stânga, fără Ctrl/Cmd — navigare în același tab. */
export function isPrimaryUnmodifiedClick(event: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
}) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey
}

/**
 * Chrome pornește autoscroll pe mousedown cu butonul din mijloc.
 * preventDefault aici (nu pe auxclick) lasă tab-ul nou să se deschidă.
 */
export function preventMiddleClickAutoscroll(
  event: { button: number; preventDefault: () => void },
  canOpen = true,
) {
  if (canOpen && event.button === 1) event.preventDefault()
}

export function openHrefInNewTab(href: string) {
  window.open(href, "_blank", "noopener,noreferrer")
}
