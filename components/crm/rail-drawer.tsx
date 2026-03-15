"use client"

import { type ReactNode, useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, type LucideIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type RailDrawerToggleRenderProps = {
  side: "left" | "right"
  title: string
  open: boolean
  toggle: () => void
}

interface RailDrawerProps {
  side: "left" | "right"
  title: string
  children: ReactNode | ((controls: { close: () => void }) => ReactNode)
  mode?: "sheet" | "inline"
  inlineBehavior?: "overlay" | "push"
  inlineWidthClassName?: string
  collapsedWidthClassName?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  triggerIcon?: LucideIcon
  iconOnly?: boolean
  triggerClassName?: string
  hideTrigger?: boolean
  className?: string
  wrapperClassName?: string
  headerClassName?: string
  titleClassName?: string
  closeButtonClassName?: string
  bodyClassName?: string
  collapsedRailClassName?: string
  renderCollapsedToggle?: (props: RailDrawerToggleRenderProps) => ReactNode
  showOverlay?: boolean
  closeOnInteractOutside?: boolean
}

export function RailDrawer({
  side,
  title,
  children,
  mode = "sheet",
  inlineBehavior = "overlay",
  inlineWidthClassName,
  collapsedWidthClassName = "w-11",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  triggerLabel,
  triggerIcon: TriggerIcon,
  iconOnly = false,
  triggerClassName,
  hideTrigger = false,
  className,
  wrapperClassName,
  headerClassName,
  titleClassName,
  closeButtonClassName,
  bodyClassName,
  collapsedRailClassName,
  renderCollapsedToggle,
  showOverlay = true,
  closeOnInteractOutside = true,
}: RailDrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp]
  )

  useEffect(() => {
    if (mode !== "inline" || !open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      setOpen(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [mode, open, setOpen])

  const content = typeof children === "function" ? children({ close: () => setOpen(false) }) : children
  const ExpandIcon = side === "left" ? ChevronRight : ChevronLeft
  const CollapseIcon = side === "left" ? ChevronLeft : ChevronRight
  const toggleRail = () => setOpen(!open)

  const trigger = hideTrigger ? null : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-8 gap-1.5 px-3 text-xs",
        iconOnly ? "h-9 w-9 rounded-full p-0" : "",
        triggerClassName
      )}
      aria-label={triggerLabel || title}
      onClick={() => setOpen(true)}
    >
      {TriggerIcon ? <TriggerIcon className="h-3.5 w-3.5" /> : null}
      {iconOnly ? null : triggerLabel || title}
    </Button>
  )

  if (mode === "inline") {
    if (inlineBehavior === "push") {
      return (
        <>
          {trigger}
          <div
            className={cn(
              "hidden h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out xl:flex",
              open ? inlineWidthClassName : collapsedWidthClassName,
              wrapperClassName
            )}
          >
            {open ? (
              <div
                className={cn(
                  "flex h-full w-full max-h-full flex-col overflow-hidden border bg-background shadow-2xl",
                  className
                )}
              >
                <div className={cn("flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3", headerClassName)}>
                  <p className={cn("text-base font-semibold text-foreground", titleClassName)}>{title}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 w-8 p-0", closeButtonClassName)}
                    onClick={toggleRail}
                    aria-label={`Închide ${title}`}
                  >
                    <CollapseIcon className="h-4 w-4" />
                  </Button>
                </div>
                <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3", bodyClassName)}>{content}</div>
              </div>
            ) : (
              <div
                className={cn(
                  "flex h-full w-full flex-col items-center overflow-hidden border bg-background px-1.5 py-2 shadow-2xl",
                  collapsedRailClassName
                )}
              >
                {renderCollapsedToggle ? (
                  renderCollapsedToggle({
                    side,
                    title,
                    open,
                    toggle: toggleRail,
                  })
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("mt-0.5 h-8 w-8 p-0", closeButtonClassName)}
                    onClick={toggleRail}
                    aria-label={`Deschide ${title}`}
                  >
                    <ExpandIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )
    }

    return (
      <>
        {trigger}
        <div
          aria-hidden={!open}
          className={cn(
            "pointer-events-none absolute inset-y-0 z-20 hidden xl:flex",
            side === "left" ? "left-0" : "right-0 justify-end",
            wrapperClassName
          )}
        >
          <div
            className={cn(
              "pointer-events-auto flex h-full max-h-full flex-col overflow-hidden border bg-background shadow-2xl transition-transform duration-300 ease-out",
              side === "left"
                ? open
                  ? "translate-x-0"
                  : "-translate-x-full"
                : open
                  ? "translate-x-0"
                  : "translate-x-full",
              className
            )}
          >
            <div className={cn("flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3", headerClassName)}>
              <p className={cn("text-base font-semibold text-foreground", titleClassName)}>{title}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", closeButtonClassName)}
                onClick={() => setOpen(false)}
                aria-label={`Închide ${title}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-3", bodyClassName)}>{content}</div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={side}
          showOverlay={showOverlay}
          className={cn("w-[92vw] max-w-sm overflow-y-auto p-0", className)}
          onInteractOutside={
            closeOnInteractOutside
              ? undefined
              : (event) => {
                  event.preventDefault()
                }
          }
          onPointerDownOutside={
            closeOnInteractOutside
              ? undefined
              : (event) => {
                  event.preventDefault()
                }
          }
        >
          <SheetHeader className={cn("border-b border-neutral-200 px-4 py-3 text-left", headerClassName)}>
            <SheetTitle className={cn("text-base", titleClassName)}>{title}</SheetTitle>
          </SheetHeader>
          <div className={cn("min-h-0 px-3 py-3", bodyClassName)}>{content}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
