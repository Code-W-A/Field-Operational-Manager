"use client"
import { Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"

interface TimeSelectorProps {
  value: string
  onChange: (value: string) => void
  label: string
  id: string
  hasError?: boolean
}

export function TimeSelector({ value, onChange, label, id, hasError = false }: TimeSelectorProps) {
  // Generate hours (00-23)
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"))

  // Generate minutes (00, 05, 10, ..., 55)
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"))

  // Split the current value into hours and minutes
  const [hour, minute] = value.split(":")

  // References to the selected hour and minute elements
  const selectedHourRef = useRef<HTMLDivElement>(null)
  const selectedMinuteRef = useRef<HTMLDivElement>(null)

  // Scroll to the selected hour and minute when the popover opens
  useEffect(() => {
    const scrollToSelected = () => {
      if (selectedHourRef.current) {
        selectedHourRef.current.scrollIntoView({ block: "center", behavior: "auto" })
      }
      if (selectedMinuteRef.current) {
        selectedMinuteRef.current.scrollIntoView({ block: "center", behavior: "auto" })
      }
    }

    // Small delay to ensure the popover is fully rendered
    const timer = setTimeout(scrollToSelected, 100)
    return () => clearTimeout(timer)
  }, [hour, minute])

  return (
    <div className="relative flex items-center w-full">
      <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 z-10" />
      <Popover>
        <PopoverTrigger asChild>
          <Button
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
        <PopoverContent className="w-64 p-2" align="start">
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className="text-sm font-medium">Ore</div>
              <div className="text-sm font-medium">Minute</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-[200px] overflow-y-auto pr-2 border-r scrollbar-thin">
                {hours.map((h) => (
                  <div
                    key={h}
                    ref={h === hour ? selectedHourRef : null}
                    className={cn(
                      "cursor-pointer px-2 py-1 rounded hover:bg-gray-100",
                      h === hour && "bg-gray-100 font-medium",
                    )}
                    onClick={() => onChange(`${h}:${minute || "00"}`)}
                  >
                    {h}
                  </div>
                ))}
              </div>
              <div className="h-[200px] overflow-y-auto pl-2 scrollbar-thin">
                {minutes.map((m) => (
                  <div
                    key={m}
                    ref={m === minute ? selectedMinuteRef : null}
                    className={cn(
                      "cursor-pointer px-2 py-1 rounded hover:bg-gray-100",
                      m === minute && "bg-gray-100 font-medium",
                    )}
                    onClick={() => onChange(`${hour || "00"}:${m}`)}
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
