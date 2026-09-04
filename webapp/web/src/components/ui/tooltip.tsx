import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) {
    throw new Error("Tooltip components must be used within <Tooltip>");
  }
  return ctx;
}

export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Lightweight tooltip wrapper – provides open state via context.
 * Uses Tailwind `group` + React state (hover/focus) – no Radix dependency.
 * Wrap TooltipTrigger + TooltipContent inside.
 */
export function Tooltip({
  children,
  className,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  ...props
}: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(v);
      onOpenChange?.(v);
    },
    [controlledOpen, onOpenChange]
  );

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div className={cn("relative inline-flex group", className)} {...props}>
        {children}
      </div>
    </TooltipContext.Provider>
  );
}
Tooltip.displayName = "Tooltip";

export const TooltipTrigger = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
>(({ className, children, asChild: _asChild, ...props }, ref) => {
  const { setOpen } = useTooltipContext();
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="button"
      aria-describedby="tooltip"
      className={cn(
        "inline-flex items-center cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
        className
      )}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: "top" | "bottom" | "left" | "right";
    sideOffset?: number;
  }
>(({ className, children, side = "top", sideOffset: _sideOffset = 8, ...props }, ref) => {
  const { open } = useTooltipContext();

  const sideClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  // Keep element mounted for CSS-only fallback (group-hover / group-focus-within)
  // React state controls `block` vs `hidden`; Tailwind group-hover ensures tooltip
  // still appears even if JS state lags.
  return (
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        "absolute z-50 max-w-xs rounded-md border bg-popover px-3 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md",
        // group-hover fallback as requested in spec + absolute positioned
        "pointer-events-none",
        sideClasses[side],
        open ? "block" : "hidden group-hover:block group-focus-within:block",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipContent.displayName = "TooltipContent";

/**
 * Convenience: (i) icon with tooltip text.
 * Usage: <InfoTooltip content="Explain what this does" /> or <InfoTooltip text="..." />
 */
export function InfoTooltip({
  content,
  text,
  side = "top",
  className,
  iconClassName,
  ...props
}: {
  content?: React.ReactNode;
  text?: string;
  side?: "top" | "bottom" | "left" | "right";
  iconClassName?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "content">) {
  const label = content ?? text;
  if (!label) return null;
  return (
    <Tooltip className={cn("align-middle", className)} {...props}>
      <TooltipTrigger className="ml-1">
        <Info
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors",
            iconClassName
          )}
          aria-label={typeof label === "string" ? label : undefined}
        />
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
InfoTooltip.displayName = "InfoTooltip";
