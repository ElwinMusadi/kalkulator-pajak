import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LABEL = "Mode Gelap";

interface ThemeSwitchProps {
  /**
   * `compact`: ikon + switch (toolbar ≥sm, dengan tooltip).
   * `row`: baris penuh berlabel teks (toolbar ponsel).
   */
  variant?: "compact" | "row";
  className?: string;
}

/**
 * Switch Mode Gelap per perangkat. Seluruh wrapper adalah <label> setinggi
 * 44px sehingga area sentuh memadai; nama aksesibel berasal dari aria-label
 * Switch (role="switch", aria-checked) — bukan tombol aria-pressed.
 */
export function ThemeSwitch({ variant = "compact", className }: ThemeSwitchProps) {
  const [theme, setTheme] = useTheme();
  const dark = theme === "dark";
  const Icon = dark ? Moon : Sun;

  const control = (
    <Switch
      checked={dark}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      aria-label={LABEL}
      data-testid="theme-switch"
    />
  );

  if (variant === "row") {
    return (
      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--ios-radius-control)] bg-[var(--ios-fill)] py-1.5 pl-3 pr-1.5 select-none",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate" aria-hidden="true">
            {LABEL}
          </span>
        </span>
        {control}
      </label>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={cn(
            "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pl-2.5 pr-1.5 select-none transition-colors hover:bg-[var(--ios-fill)]",
            className,
          )}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {control}
        </label>
      </TooltipTrigger>
      <TooltipContent side="bottom">{LABEL}</TooltipContent>
    </Tooltip>
  );
}
