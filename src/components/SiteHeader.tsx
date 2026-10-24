/** The site's name and its two experiments, on every page. */
export function SiteHeader({ active }: { active: 'day' | 'lynch' }) {
  const link = (key: 'day' | 'lynch', href: string, label: string) => (
    <a
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active === key ? 'bg-brand text-background' : 'text-muted-foreground hover:text-foreground hover:bg-card'
      }`}
    >
      {label}
    </a>
  )
  return (
    <nav aria-label="เมนู" className="flex flex-wrap items-center justify-between gap-3">
      <a href="/" className="flex items-center gap-2 font-semibold">
        <img src="/logo.png" alt="" className="size-8" />
        Let Claude cook
      </a>
      <div className="bg-muted/60 flex gap-1 rounded-full p-1">
        {link('day', '/', 'เดย์เทรด')}
        {link('lynch', '/lynch', 'ทีม Lynch (รายสัปดาห์)')}
      </div>
    </nav>
  )
}
