"use client"
import { Clock } from "lucide-react"
import type React from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

interface TimeSelectorProps {
  value: string
  onChange: (value: string) => void
  label: string
  id: string
  hasError?: boolean
}

export function TimeSelector({ value, onChange, label, id, hasError = false }: TimeSelectorProps) {
  // State to control the popover
  const [open, setOpen] = useState(false)

  // Generate hours (00-23)
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"))

  // Generate minutes (00, 05, 10, ..., 55)
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"))

  // Split the current value into hours and minutes
  const [hour, minute] = value.split(":")

  // References to the selected hour and minute elements
  const selectedHourRef = useRef<HTMLDivElement>(null)
  const selectedMinuteRef = useRef<HTMLDivElement>(null)

  // Container refs for scrolling
  const hoursContainerRef = useRef<HTMLDivElement>(null)
  const minutesContainerRef = useRef<HTMLDivElement>(null)

  // Refs for drag state
  const isDraggingHoursRef = useRef(false)
  const isDraggingMinutesRef = useRef(false)
  const lastYPositionRef = useRef(0)
  const velocityRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)

  // Scroll to the selected hour and minute when the popover opens
  useEffect(() => {
    if (open) {
      const scrollToSelected = () => {
        if (selectedHourRef.current && hoursContainerRef.current) {
          const container = hoursContainerRef.current
          const element = selectedHourRef.current
          const containerRect = container.getBoundingClientRect()
          const elementRect = element.getBoundingClientRect()

          container.scrollTop =
            element.offsetTop - container.offsetTop - containerRect.height / 2 + elementRect.height / 2
        }

        if (selectedMinuteRef.current && minutesContainerRef.current) {
          const container = minutesContainerRef.current
          const element = selectedMinuteRef.current
          const containerRect = container.getBoundingClientRect()
          const elementRect = element.getBoundingClientRect()

          container.scrollTop =
            element.offsetTop - container.offsetTop - containerRect.height / 2 + elementRect.height / 2
        }
      }

      // Small delay to ensure the popover is fully rendered
      const timer = setTimeout(scrollToSelected, 100)
      return () => clearTimeout(timer)
    }
  }, [open, hour, minute])

  // Handle time selection
  const handleTimeSelection = (newHour: string, newMinute: string) => {
    onChange(`${newHour}:${newMinute}`)
    // Close the popover after selection
    setTimeout(() => setOpen(false), 100)
  }

  // Function to find the closest time value based on scroll position
  const findClosestTimeValue = (container: HTMLDivElement, items: string[]) => {
    const containerRect = container.getBoundingClientRect()
    const containerMiddle = containerRect.top + containerRect.height / 2

    let closestItem = items[0]
    let minDistance = Number.POSITIVE_INFINITY

    Array.from(container.children).forEach((child, index) => {
      const childRect = child.getBoundingClientRect()
      const childMiddle = childRect.top + childRect.height / 2
      const distance = Math.abs(childMiddle - containerMiddle)

      if (distance < minDistance) {
        minDistance = distance
        closestItem = items[index]
      }
    })

    return closestItem
  }

  // Handle mouse wheel events for scrolling
  const handleWheel = (e: React.WheelEvent, isHours: boolean) => {
    e.preventDefault()
    const container = isHours ? hoursContainerRef.current : minutesContainerRef.current
    if (!container) return

    container.scrollTop += e.deltaY

    // Debounce the selection update
    clearTimeout((container as any).wheelTimeout)
    ;(container as any).wheelTimeout = setTimeout(() => {
      const items = isHours ? hours : minutes
      const closestValue = findClosestTimeValue(container, items)

      if (isHours) {
        handleTimeSelection(closestValue, minute || "00")
      } else {
        handleTimeSelection(hour || "00", closestValue)
      }
    }, 150)
  }

  // Handle touch and mouse events for dragging
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, isHours: boolean) => {
    e.preventDefault()
    if (isHours) {
      isDraggingHoursRef.current = true
    } else {
      isDraggingMinutesRef.current = true
    }

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    lastYPositionRef.current = clientY
    velocityRef.current = 0

    document.addEventListener("mousemove", handleDragMove)
    document.addEventListener("touchmove", handleDragMove, { passive: false })
    document.addEventListener("mouseup", handleDragEnd)
    document.addEventListener("touchend", handleDragEnd)
  }

  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    const deltaY = lastYPositionRef.current - clientY

    velocityRef.current = deltaY * 0.8 + velocityRef.current * 0.2

    if (isDraggingHoursRef.current && hoursContainerRef.current) {
      hoursContainerRef.current.scrollTop += deltaY
    } else if (isDraggingMinutesRef.current && minutesContainerRef.current) {
      minutesContainerRef.current.scrollTop += deltaY
    }

    lastYPositionRef.current = clientY
  }

  const handleDragEnd = () => {
    document.removeEventListener("mousemove", handleDragMove)
    document.removeEventListener("touchmove", handleDragMove)
    document.removeEventListener("mouseup", handleDragEnd)
    document.removeEventListener("touchend", handleDragEnd)

    // Start inertia animation
    if (Math.abs(velocityRef.current) > 1) {
      startInertiaAnimation()
    } else {
      // If no significant velocity, just snap to closest value
      snapToClosestValue()
    }

    isDraggingHoursRef.current = false
    isDraggingMinutesRef.current = false
  }

  const startInertiaAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const animate = () => {
      if (Math.abs(velocityRef.current) < 0.5) {
        cancelAnimationFrame(animationFrameRef.current!)
        snapToClosestValue()
        return
      }

      velocityRef.current *= 0.95 // Deceleration factor

      if (isDraggingHoursRef.current && hoursContainerRef.current) {
        hoursContainerRef.current.scrollTop += velocityRef.current
      } else if (isDraggingMinutesRef.current && minutesContainerRef.current) {
        minutesContainerRef.current.scrollTop += velocityRef.current
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }

  const snapToClosestValue = () => {
    if (isDraggingHoursRef.current && hoursContainerRef.current) {
      const closestHour = findClosestTimeValue(hoursContainerRef.current, hours)
      handleTimeSelection(closestHour, minute || "00")
    } else if (isDraggingMinutesRef.current && minutesContainerRef.current) {
      const closestMinute = findClosestTimeValue(minutesContainerRef.current, minutes)
      handleTimeSelection(hour || "00", closestMinute)
    }
  }

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <div className="relative flex items-center w-full">
      <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 z-10" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full pl-10 justify-start text-left font-normal",
              hasError && "border-red-500 focus-visible:ring-red-500",
            )}
            aria-label={label}
          >
            {hour || "00"}:{minute || "00"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-3 shadow-md rounded-md"
          align="start"
          onInteractOutside={(e) => {
            e.preventDefault()
          }}
          onEscapeKeyDown={() => setOpen(false)}
          onPointerDownOutside={(e) => {
            e.preventDefault()
          }}
        >
          <div className="space-y-3">
            <div className="flex justify-between border-b pb-2">
              <div className="text-sm font-medium">Ore</div>
              <div className="text-sm font-medium">Minute</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div
                ref={hoursContainerRef}
                className="h-[200px] overflow-y-auto pr-3 border-r scrollbar-thin time-selector-scroll touch-pan-y"
                onWheel={(e) => handleWheel(e, true)}
                onMouseDown={(e) => handleDragStart(e, true)}
                onTouchStart={(e) => handleDragStart(e, true)}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    ref={h === hour ? selectedHourRef : null}
                    className={cn(
                      "cursor-pointer px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors",
                      h === hour && "bg-primary text-primary-foreground font-medium",
                    )}
                    onClick={() => handleTimeSelection(h, minute || "00")}
                  >
                    {h}
                  </div>
                ))}
              </div>
              <div
                ref={minutesContainerRef}
                className="h-[200px] overflow-y-auto pl-3 scrollbar-thin time-selector-scroll touch-pan-y"
                onWheel={(e) => handleWheel(e, false)}
                onMouseDown={(e) => handleDragStart(e, false)}
                onTouchStart={(e) => handleDragStart(e, false)}
              >
                {minutes.map((m) => (
                  <div
                    key={m}
                    ref={m === minute ? selectedMinuteRef : null}
                    className={cn(
                      "cursor-pointer px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors",
                      m === minute && "bg-primary text-primary-foreground font-medium",
                    )}
                    onClick={() => handleTimeSelection(hour || "00", m)}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
