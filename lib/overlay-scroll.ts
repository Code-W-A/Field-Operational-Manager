import type { WheelEvent as ReactWheelEvent } from "react"

const OVERLAY_ROOT_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-popover-content]",
  "[data-radix-select-content]",
  "[data-radix-menu-content]",
  "[cmdk-root]",
].join(",")

type ScrollableElement = {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
  parentElement: ScrollableElement | null
  closest?: (selector: string) => Element | null
  contains?: (other: Element) => boolean
  hasAttribute?: (name: string) => boolean
}

function asScrollableElement(value: unknown): ScrollableElement | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const element = value as ScrollableElement
  if (
    typeof element.scrollHeight !== "number" ||
    typeof element.clientHeight !== "number" ||
    typeof element.scrollTop !== "number"
  ) {
    return null
  }

  return element
}

function isScrollableElement(element: ScrollableElement): boolean {
  if (element.scrollHeight <= element.clientHeight) {
    return false
  }

  if (element.hasAttribute?.("cmdk-list")) {
    return true
  }

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const overflowY = window.getComputedStyle(element as unknown as Element).overflowY
    return overflowY === "auto" || overflowY === "scroll"
  }

  return false
}

export function findScrollableOverlayElement(target: EventTarget | null): ScrollableElement | null {
  if (typeof target !== "object" || target === null || typeof (target as Element).closest !== "function") {
    return null
  }

  const overlayRoot = (target as Element).closest(OVERLAY_ROOT_SELECTOR)
  if (!overlayRoot) {
    return null
  }

  let element = asScrollableElement(target)
  while (element && overlayRoot.contains(element as unknown as Element)) {
    if (isScrollableElement(element)) {
      return element
    }
    element = asScrollableElement(element.parentElement)
  }

  return null
}

export function applyOverlayWheelScroll(event: WheelEvent | ReactWheelEvent<HTMLElement>): boolean {
  const scrollable =
    asScrollableElement(event.currentTarget) && isScrollableElement(asScrollableElement(event.currentTarget)!)
      ? asScrollableElement(event.currentTarget)!
      : findScrollableOverlayElement(event.target)

  if (!scrollable) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()

  const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight
  scrollable.scrollTop = Math.min(maxScrollTop, Math.max(0, scrollable.scrollTop + event.deltaY))
  return true
}
