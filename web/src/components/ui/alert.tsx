import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm flex items-start gap-3 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:mt-0.5',
  {
    variants: {
      variant: {
        default: 'bg-muted/40 text-foreground border-border',
        warning: 'border-amber-200 bg-amber-50/70 text-amber-900 [&>svg]:text-amber-600',
        destructive: 'border-red-200 bg-red-50/70 text-red-900 [&>svg]:text-red-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';
