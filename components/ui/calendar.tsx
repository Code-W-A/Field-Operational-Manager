"use client"

import type * as React from "react"
import { DayPicker } from "react-day-picker"
import { ro } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({ className, classNames, showOutsideDays = true, locale = ro, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn("p-2 select-none", className)}
      classNames={{
        // container that can hold 1–2 months side‑by‑side on wide screens
        months: "flex flex-col gap-4 sm:flex-row",

        // each individual month card
        month: "flex flex-col gap-1 p-2",

        // caption with title & navigation
        caption: "flex items-center justify-between mb-1",
        caption_label: "text-base font-medium tracking-normal",
        nav: "flex items-center gap-1",
        nav_button: cn(buttonVariants({ variant: "ghost" }), "h-8 w-8 p-0"),

        // calendar grid
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7 mb-1",
        head_cell: "text-center text-xs font-medium uppercase text-muted-foreground",
        row: "grid grid-cols-7 gap-[2px]",
        cell: "relative flex aspect-square items-center justify-center aria-selected:rounded aria-selected:bg-primary aria-selected:text-primary-foreground focus-within:z-10",
        day: cn(buttonVariants({ variant: "ghost" }), "w-full h-full p-0 font-normal aria-selected:opacity-100"),

        // states
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "border border-primary",
        day_outside:
          "text-muted-foreground opacity-40 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-40",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_range_end: "rounded-r",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"
