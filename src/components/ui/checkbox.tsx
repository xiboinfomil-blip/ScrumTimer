"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      className={cn(
        "peer group inline-grid size-11 shrink-0 place-items-center rounded-md text-brand outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted aria-invalid:ring-destructive",
        className
      )}
      {...props}
    >
      <span className="grid size-4 place-items-center rounded-[3px] border border-control bg-white group-data-[state=checked]:border-brand group-data-[state=checked]:bg-brand group-data-[state=indeterminate]:border-brand group-data-[state=indeterminate]:bg-brand group-disabled:bg-muted-surface">
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-white transition-none"
      >
        {checked === 'indeterminate' ? <MinusIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
      </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
