import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

/** A collapsible row: a label, the content underneath. */
export function Fold({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="group border-t py-2.5 first:border-t-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pt-2 text-sm">{children}</div>
    </details>
  )
}

export const toneOf = (x: number | null | undefined) =>
  x == null || Math.abs(x) < 0.005 ? '' : x > 0 ? 'text-delta-up' : 'text-delta-down'

