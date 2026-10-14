import type { ReactNode } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type StepStatusTone = "success" | "warning" | "neutral" | "info";

const STATUS_TONE_CLASS: Record<StepStatusTone, string> = {
  success: "border-success-subtle bg-success-subtle text-success",
  // Teks warning dicampur warna foreground agar kontras ≥ 4.5:1 pada chip kecil
  // (terang pada tema terang, lebih terang pada tema gelap).
  warning:
    "border-warning/30 bg-warning/10 text-[color-mix(in_oklch,var(--warning)_76%,var(--foreground))]",
  neutral: "border-border bg-muted text-muted-foreground",
  info: "step-badge",
};

function StepStatusChip({
  label,
  tone,
}: {
  label: string;
  tone: StepStatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold leading-4",
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
  status?: string;
  statusTone?: StepStatusTone;
  className?: string;
}

/**
 * Kepala tahap form: nomor | judul + status | hint.
 * Dipakai bersama oleh tahap statis (Identitas Kendaraan) dan tahap accordion
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
        className="numeric step-badge flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
        aria-hidden="true"
      >
        {step}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        {/* flex-wrap: di layar sempit chip status turun ke baris baru. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            data-step-title=""
            className="min-w-0 text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground transition-colors"
          >
            {title}
          </span>
          {status && (
            <span className="sm:ml-auto">
              <StepStatusChip label={status} tone={statusTone} />
            </span>
          )}
        </span>
        <span className="text-sm font-normal leading-snug text-muted-foreground">
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
  status?: string;
  statusTone?: StepStatusTone;
  children: ReactNode;
}

/**
 * Tahap form yang dapat dibuka/ditutup (Radix Accordion — keyboard bawaan).
 * Tahap dipisah garis tipis; konten sejajar judul pada ≥sm dan selebar kartu
 * pada mobile. `px-1` menjaga cincin fokus input tidak terpotong oleh
 * `overflow-hidden` milik AccordionContent.
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
    <AccordionItem value={value} className="border-b-0 border-t">
      <AccordionTrigger
        className={cn(
          "group/step gap-3 rounded-md py-5 text-left hover:no-underline",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          "hover:[&_[data-step-title]]:text-primary",
          "items-start [&>svg]:mt-1.5 [&>svg]:text-muted-foreground",
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
      <AccordionContent className="px-1 pb-6 pt-1 sm:pl-10">
        <div className="@container min-w-0">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
