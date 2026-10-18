import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[0.9375rem] font-semibold leading-tight transition-[color,background-color,background-image,border-color,box-shadow,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Gradasi teal lembut: satu-satunya permukaan berwarna kuat (aksi utama).
        default:
          "bg-primary bg-[image:var(--gradient-teal)] text-primary-foreground shadow-xs hover:bg-[image:var(--gradient-teal-hover)] active:opacity-85",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 active:opacity-85 dark:text-[#2a0603]",
        outline:
          "border border-input bg-card text-foreground hover:bg-muted active:bg-[var(--ios-fill-strong)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent active:opacity-85",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground active:opacity-80",
        link: "text-primary underline-offset-4 hover:underline",
        /** Tombol di atas band teal gelap (.brand-band). Di dalam `.ios-toolbar`
         *  gaya ini diterjemahkan ke tombol toolbar terang oleh index.css. */
        onDark:
          "border border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/16 hover:text-white focus-visible:ring-white/70 focus-visible:ring-offset-0 disabled:opacity-60",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 rounded-lg px-3 text-sm pointer-coarse:h-11",
        lg: "h-12 rounded-[0.875rem] px-6 text-[1.0625rem]",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        data-slot="button"
        data-variant={variant ?? "default"}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
