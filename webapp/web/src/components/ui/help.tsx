import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PageHelpProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  tips: readonly string[];
  icon?: React.ReactNode;
}

/**
 * PageHelp – dashed Card with title + description + bullet tips.
 * Use at top of pages to explain what the page does in plain English.
 *
 * Example:
 * <PageHelp title="Jobs" description="Jobs are saved crawler recipes." tips={["Tip one", "Tip two"]} />
 */
export function PageHelp({ title, description, tips, icon, className, ...props }: PageHelpProps) {
  return (
    <Card className={cn("border-dashed bg-muted/20 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:bg-muted/30 hover:border-primary/15", className)} {...props}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 font-semibold">
          {icon ?? <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
          {title}
        </CardTitle>
        {description && <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>}
      </CardHeader>
      {tips.length > 0 && (
        <CardContent className="pt-0">
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground leading-relaxed">
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
PageHelp.displayName = "PageHelp";

/**
 * FieldHelp – small muted text under inputs, for per-field guidance.
 * Renders as <p class="text-xs text-muted-foreground">.
 *
 * Example:
 * <Label>Start URLs <InfoTooltip .../></Label>
 * <Input ... />
 * <FieldHelp>Where the crawler begins – paste one per line, e.g., https://example.com/products</FieldHelp>
 */
export const FieldHelp = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-muted-foreground leading-relaxed mt-1", className)} {...props}>
      {children}
    </p>
  )
);
FieldHelp.displayName = "FieldHelp";

export interface HelpBadgeProps extends React.ComponentProps<typeof Badge> {}

/**
 * HelpBadge – small Badge with HelpCircle icon for inline help hints / "what is this?" labels.
 * Uses secondary variant by default.
 */
export function HelpBadge({ className, children, variant = "secondary", ...props }: HelpBadgeProps) {
  return (
    <Badge variant={variant} className={cn("gap-1 font-normal", className)} {...props}>
      <HelpCircle className="h-3 w-3 shrink-0" />
      {children}
    </Badge>
  );
}
HelpBadge.displayName = "HelpBadge";
