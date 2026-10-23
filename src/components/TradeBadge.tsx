import { Badge } from '@/components/ui/badge'

const TRADE_LABELS = { Buy: 'ซื้อ', Sell: 'ขาย' } as const

/** Buy in green, sell in red (the label carries it too). */
export function TradeBadge({ kind }: { kind: keyof typeof TRADE_LABELS }) {
  return (
    <Badge
      variant="ghost"
      className={kind === 'Buy' ? 'bg-delta-up/10 text-delta-up' : 'bg-delta-down/10 text-delta-down'}
    >
      {TRADE_LABELS[kind]}
    </Badge>
  )
}
