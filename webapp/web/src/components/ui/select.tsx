import * as React from "react";
import { cn } from "@/lib/utils";
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <select className={cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-all duration-200 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring focus-visible:shadow-sm", className)} ref={ref} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
export { Select };
