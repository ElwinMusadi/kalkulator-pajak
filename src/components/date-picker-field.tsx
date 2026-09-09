import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { SelectSingleEventHandler } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerFieldProps {
  id: string
  label: string
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  required?: boolean
  placeholder?: string
  description?: string
  invalid?: boolean
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder = "Pilih tanggal",
  description,
  invalid = false,
}: DatePickerFieldProps) {
  const handleSelect: SelectSingleEventHandler = (day) => {
    onChange(day)
  }

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            className={cn(
              "h-10 w-full justify-start px-3 text-left font-normal",
              !value && "text-muted-foreground",
              invalid && "border-destructive",
            )}
          >
            <CalendarIcon data-icon="inline-start" aria-hidden="true" />
            <span className={cn(value && "numeric font-medium text-foreground")}>
              {value ? format(value, "dd/MM/yyyy") : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            locale={idLocale}
            onSelect={handleSelect}
            captionLayout="dropdown-buttons"
            fromYear={2000}
            toYear={new Date().getFullYear() + 10}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
