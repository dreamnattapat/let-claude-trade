/** The site's name, on every page. */
export function SiteHeader() {
  return (
    <nav aria-label="เมนู" className="flex flex-wrap items-center justify-between gap-3">
      <a href="/" className="flex items-center gap-2 font-semibold">
        <img src="/logo.png" alt="" className="size-8" />
        Let Claude Trade
      </a>
    </nav>
  )
}
