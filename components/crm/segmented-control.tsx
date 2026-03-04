import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SegmentedItem {
  id: string
  label: string
  icon?: LucideIcon
}

interface SegmentedControlProps {
  value: string
  items: SegmentedItem[]
  onValueChange: (value: string) => void
  className?: string
}

export function SegmentedControl({ value, items, onValueChange, className }: SegmentedControlProps) {
  return (
    <div className={cn("inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1", className)}>
      {items.map((item) => {
        const active = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onValueChange(item.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium leading-none transition",
              active
                ? "border border-neutral-200 bg-white text-neutral-900 shadow-sm shadow-black/[0.04]"
                : "border border-transparent text-neutral-600 hover:text-neutral-900"
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5 text-neutral-500" /> : null}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

