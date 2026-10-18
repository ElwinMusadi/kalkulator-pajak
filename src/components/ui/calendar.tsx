import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2 sm:p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "relative flex h-11 items-center justify-center",
        caption_label: "flex items-center gap-1 rounded-md text-[0.9375rem] font-semibold",
        caption_dropdowns: "flex h-full w-full items-center justify-center gap-1.5 px-12 text-[0.9375rem] font-semibold",
        dropdown_month: "relative inline-flex items-center",
        dropdown_year: "relative inline-flex items-center",
        dropdown: "absolute inset-0 h-full w-full cursor-pointer opacity-0",
        dropdown_icon: "ml-1 h-3.5 w-3.5 text-muted-foreground",
        vhidden: "sr-only",
        nav: "absolute inset-x-1 flex items-center justify-between",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-10 rounded-full p-0 text-primary pointer-coarse:size-11"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        // Sel hari 40px (pointer presisi) / hingga 44px (sentuh), menyusut
        // proporsional agar 7 kolom tetap muat di layar 320px.
        head_cell: "w-10 text-[0.8125rem] font-medium text-muted-foreground pointer-coarse:w-[clamp(2.25rem,calc((100vw-2.5rem)/7),2.75rem)]",
        row: "flex w-full mt-1",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected].day-range-end)]:rounded-r-full",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-full"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-10 rounded-full p-0 text-base font-normal aria-selected:opacity-100 pointer-coarse:size-[clamp(2.25rem,calc((100vw-2.5rem)/7),2.75rem)]"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "font-semibold text-primary aria-selected:text-primary-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
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

export { Calendar }
