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
      className={cn("p-3 select-none", className)}
      classNames={{
        // wrapper around one or more months
        months: "flex flex-col gap-4 sm:flex-row sm:gap-6",
        // single month card
        month: "space-y-2",
        // caption with month name & navigation
        caption: "flex items-center justify-between",
        caption_label: "text-base font-semibold",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 p-0 opacity-60 hover:opacity-100"
        ),
        nav_button_previous: "",
        nav_button_next: "",
        // month grid
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7",
        head_cell:
          "text-center text-muted-foreground text-xs font-medium h-9 leading-9",
        row: "grid grid-cols-7",
        cell:
          "relative h-10 w-10 text-center p-0 aria-selected:rounded aria-selected:bg-primary aria-selected:text-primary-foreground focus-within:z-10",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "rounded-r",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
