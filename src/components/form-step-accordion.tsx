import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type StepStatusTone = "success" | "warning" | "neutral" | "info";

const STATUS_TONE_CLASS: Record<StepStatusTone, string> = {
  success: "bg-success-subtle text-success",
  // Teks warning dicampur warna foreground agar kontras ≥ 4.5:1 pada chip kecil.
  warning:
    "bg-warning/12 text-[color-mix(in_oklch,var(--warning)_76%,var(--foreground))]",
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
};

function StepStatusChip({
  label,
  tone,
}: {
  /** ReactNode agar nominal di dalam chip dapat memakai `.monetary`. */
  label: ReactNode;
  tone: StepStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
        STATUS_TONE_CLASS[tone],
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-current"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

interface FormStepHeadingProps {
  step: string;
  title: string;
  hint: string;
  status?: ReactNode;
  statusTone?: StepStatusTone;
  className?: string;
}

/**
 * Kepala tahap form: nomor | judul + status | hint.
 * Dipakai bersama oleh tahap statis (Kendaraan) dan baris disclosure accordion
 * agar ritme visual seluruh form identik.
 */
export function FormStepHeading({
  step,
  title,
  hint,
  status,
  statusTone = "neutral",
  className,
}: FormStepHeadingProps) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-start gap-3", className)}>
      <span
        className="numeric flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.8125rem] font-semibold text-primary"
        aria-hidden="true"
      >
        {step}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
        {/* flex-wrap: di layar sempit chip status turun ke baris baru. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            data-step-title=""
            className="min-w-0 text-[1.0625rem] font-semibold leading-snug text-foreground"
          >
            {title}
          </span>
          {status && <StepStatusChip label={status} tone={statusTone} />}
        </span>
        <span className="text-[0.9375rem] font-normal leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
    </span>
  );
}

interface FormStepAccordionProps {
  value: string;
  step: string;
  title: string;
  hint: string;
  status?: ReactNode;
  statusTone?: StepStatusTone;
  children: ReactNode;
}

/**
 * Satu baris disclosure dalam grup inset (Radix Accordion — keyboard bawaan).
 * Pemisah antarbaris berasal dari `divide-y` grup induk; konten terbuka
 * sejajar teks judul pada ≥sm dan selebar grup pada mobile.
 */
export function FormStepAccordion({
  value,
  step,
  title,
  hint,
  status,
  statusTone,
  children,
}: FormStepAccordionProps) {
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger
        className={cn(
          "group/step min-h-11 gap-3 rounded-none px-4 py-4 text-left hover:bg-muted/50 hover:no-underline sm:px-5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          "items-start [&>svg]:mt-1 [&>svg]:size-5 [&>svg]:text-muted-foreground",
        )}
      >
        <FormStepHeading
          step={step}
          title={title}
          hint={hint}
          status={status}
          statusTone={statusTone}
        />
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-5 pt-1 sm:pl-15 sm:pr-5">
        <div className="@container min-w-0">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
