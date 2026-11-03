import { useEffect, useState } from 'react'
import { Activity, Bell } from 'lucide-react'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 flex items-center justify-between px-4 py-4 md:px-6
        border-b backdrop-blur-xl backdrop-saturate-150 transition-all duration-300
        ${scrolled
          ? 'border-white/10 bg-ink/60 shadow-lg shadow-black/20'
          : 'border-transparent bg-ink/30'}`}
    >
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Activity className="h-6 w-6 text-brand" />
        DocScribeAi
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-400 md:inline">
          Online
        </span>
        <button aria-label="Notifications" className="rounded-full p-2 transition hover:bg-white/10">
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}