import { useEffect, useState } from 'react'
import { Stethoscope, Bell, Sparkles } from 'lucide-react'

// Application top navigation bar with system status and AI model badges
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  // Track window scroll position to add subtle shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 h-14 border-b border-slate-200 bg-white flex items-center transition-all duration-200 ${
        scrolled ? 'shadow-2xs' : ''
      }`}
    >
      {/* Brand logo aligned with sidebar width */}
      <div className="w-auto md:w-64 shrink-0 h-full md:border-r md:border-slate-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 border border-teal-200 text-teal-600 shadow-2xs">
            <Stethoscope className="h-4.5 w-4.5" strokeWidth={2.2} />
          </div>
          <div className="text-base tracking-tight select-none">
            <span className="font-extrabold text-slate-900">DocScribe</span>
            <span className="font-extrabold text-teal-600 ml-0.5">AI</span>
          </div>
        </div>

        {/* Mobile branding badge */}
        <span className="text-[10px] font-semibold text-teal-700 md:hidden flex items-center gap-1 pl-2">
          <Sparkles size={10} className="text-teal-600" /> Gnani.ai
        </span>
      </div>

      {/* Main navigation header content */}
      <div className="flex-1 h-full px-4 sm:px-6 flex items-center justify-between">
        {/* Desktop console title and active AI models badge */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">Clinical Console</span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
            <Sparkles size={11} className="text-teal-600" /> Gnani.ai: Prisma • Evon • Timbre
          </span>
        </div>

        {/* Status indicator and notification button */}
        <div className="flex items-center gap-2.5 ml-auto">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            OPD Active
          </span>

          <button
            aria-label="Notifications"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
