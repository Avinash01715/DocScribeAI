import { LayoutDashboard, Mic, FileText, Settings, User } from 'lucide-react'

const sideItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Consultation', icon: Mic },
  { label: 'Prescriptions', icon: FileText },
  { label: 'Settings', icon: Settings },
]

const bottomItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Consultation', icon: Mic },
  { label: 'Prescriptions', icon: FileText },
  { label: 'Profile', icon: User },
]

export default function Sidebar({ active = 'Dashboard' }) {
  return (
    <aside className="hidden w-60 shrink-0 self-start rounded-xl bg-panel p-4 md:block">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand">Menu</p>
      <nav className="space-y-1">
        {sideItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
              active === label ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export function BottomNav({ active = 'Dashboard' }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-white/10 bg-panel py-3 md:hidden">
      {bottomItems.map(({ label, icon: Icon }) => (
        <button
          key={label}
          aria-label={label}
          className={active === label ? 'text-brand' : 'text-slate-400'}
        >
          <Icon className="h-6 w-6" />
        </button>
      ))}
    </nav>
  )
}