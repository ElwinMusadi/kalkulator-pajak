import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { SelectSingleEventHandler } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  id: string;
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder = "Pilih Tanggal",
  invalid = false,
}: DatePickerFieldProps) {
  const handleSelect: SelectSingleEventHandler = (day) => {
    onChange(day);
  };

  return (
    <Field data-invalid={invalid || undefined} className="min-w-0 gap-2">
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
              "h-10 w-full min-w-0 justify-start gap-2.5 bg-card px-3 text-left font-normal shadow-xs",
              "[&_svg]:text-muted-foreground",
              invalid && "border-destructive ring-1 ring-destructive/25",
            )}
          >
            <CalendarIcon aria-hidden="true" />
            {/*
              Warna teks mengikuti state hover tombol outline (selector
              `hover:[&_span]` pada varian), jadi tidak dikunci di sini.
            */}
            {value ? (
              <span className="numeric min-w-0 truncate text-sm font-medium leading-none text-foreground">
                {format(value, "dd/MM/yyyy")}
              </span>
            ) : (
              <span className="min-w-0 truncate text-sm leading-none text-muted-foreground">
                {placeholder}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            locale={idLocale}
            onSelect={handleSelect}
            captionLayout="dropdown-buttons"
            fromYear={2005}
            toYear={new Date().getFullYear() + 5}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
