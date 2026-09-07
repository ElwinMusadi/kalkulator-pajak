import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { SelectSingleEventHandler } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerFieldProps {
  id: string
  label: string
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  required?: boolean
  placeholder?: string
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder = "Pilih tanggal",
}: DatePickerFieldProps) {
  const handleSelect: SelectSingleEventHandler = (day) => {
    onChange(day)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "dd/MM/yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelect}
            locale={idLocale}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
