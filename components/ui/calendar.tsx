"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ro } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = ro,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn(
        "p-3 select-none rounded-md bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-700",
        className,
      )}
      classNames={{
        // Layout
        months: "flex flex-col gap-6 sm:flex-row sm:gap-8 justify-center max-sm:items-center",
        month: "space-y-4",
        caption: "flex justify-center items-center relative",
        caption_label: "text-sm font-semibold",
        // Navigation
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-8 w-8 bg-transparent p-0 opacity-70 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        // Table / grid
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "w-9 text-[0.7rem] font-medium text-muted-foreground rounded-md",
        row: "flex w-full mt-1",
        cell: "relative h-9 w-9 p-0 text-center text-sm focus-within:z-20",
        // Day cells
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal hover:bg-accent/70",
        ),
        day_today:
          "border border-primary text-primary dark:border-primary-300 dark:text-primary-300",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90 focus:text-primary-foreground",
        day_outside: "text-muted-foreground opacity-40 aria-selected:bg-primary/10",
        day_disabled: "text-muted-foreground opacity-40",
        day_range_middle: "aria-selected:bg-primary/20 aria-selected:text-primary-foreground",
        day_range_end: "day-range-end",
        day_hidden: "invisible",
        // Allow caller overrides last
        ...classNames,
      }}
      components={{
        IconLeft: (iconProps: React.ComponentProps<"svg">) => (
          <ChevronLeft className="h-4 w-4" {...iconProps} />
        ),
        IconRight: (iconProps: React.ComponentProps<"svg">) => (
          <ChevronRight className="h-4 w-4" {...iconProps} />
        ),
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
