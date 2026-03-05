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
    <div className={cn("inline-flex items-center gap-1", className)}>
      {items.map((item) => {
        const active = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onValueChange(item.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium leading-none transition",
              active
                ? "border-neutral-300 bg-neutral-50 text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:text-neutral-900"
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
