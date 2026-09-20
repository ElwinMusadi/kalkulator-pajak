import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface FormStepAccordionProps {
  value: string;
  step: string;
  title: string;
  hint: string;
  status?: string;
  children: ReactNode;
}

/**
 * Tahap form yang dapat dibuka dan ditutup menggunakan Radix Accordion.
 * Konten otomatis sejajar dengan awal teks judul setelah badge nomor tahap.
 */
export function FormStepAccordion({
  value,
  step,
  title,
  hint,
  status,
  children,
}: FormStepAccordionProps) {
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger className="items-start py-0 text-left hover:no-underline [&>svg]:mt-1.5">
        <span
          className="numeric step-badge flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
          aria-hidden="true"
        >
          {step}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </span>
            {status && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                {status}
              </Badge>
            )}
          </span>
          <span className="text-sm font-normal leading-snug text-muted-foreground">
            {hint}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pl-10 pt-3">{children}</AccordionContent>
    </AccordionItem>
  );
}
