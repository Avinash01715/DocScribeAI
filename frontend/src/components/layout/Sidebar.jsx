import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Mic, FileText, Settings, User } from 'lucide-react'

// Desktop sidebar ke items (path bhi saath mein)
const sideItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Consultation', icon: Mic, path: '/consultation' },
  { label: 'Prescriptions', icon: FileText, path: '/prescriptions' },
  { label: 'Settings', icon: Settings, path: '/settings' },
]

// Mobile bottom nav ke items
const bottomItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Consultation', icon: Mic, path: '/consultation' },
  { label: 'Prescriptions', icon: FileText, path: '/prescriptions' },
  { label: 'Profile', icon: User, path: '/profile' },
]

export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 self-start rounded-xl bg-panel p-4 md:block">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand">Menu</p>
      <nav className="space-y-1">
        {sideItems.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={label}
            to={path}
            end={path === '/'} // sirf exact / pe active dikhe, /consultation pe nahi
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

// Mobile ke liye bottom navigation
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-white/10 bg-panel py-3 md:hidden">
      {bottomItems.map(({ label, icon: Icon, path }) => (
        <NavLink
          key={label}
          to={path}
          end={path === '/'}
          aria-label={label}
          className={({ isActive }) => (isActive ? 'text-brand' : 'text-slate-400')}
        >
          <Icon className="h-6 w-6" />
        </NavLink>
      ))}
    </nav>
  )
}