import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Mic,
  FileText,
  Settings,
  User,
  Sparkles
} from 'lucide-react'

// Primary desktop sidebar navigation link definitions
const sideItems = [
  { label: 'Dashboard',    icon: LayoutDashboard, path: '/' },
  { label: 'Consultation', icon: Mic,              path: '/consultation' },
  { label: 'Prescriptions',icon: FileText,         path: '/prescriptions' },
  { label: 'Settings',     icon: Settings,         path: '/settings' },
]

// Mobile bottom navigation bar link definitions
const bottomItems = [
  { label: 'Dashboard',    icon: LayoutDashboard, path: '/' },
  { label: 'Consultation', icon: Mic,              path: '/consultation' },
  { label: 'Prescriptions',icon: FileText,         path: '/prescriptions' },
  { label: 'Profile',      icon: User,             path: '/profile' },
]

// Desktop fixed sidebar component
export default function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 fixed top-14 bottom-0 left-0 z-30 md:flex md:flex-col md:justify-between border-r border-slate-200 bg-white p-4 shadow-2xs">
      {/* Primary navigation menu */}
      <div>
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Menu
        </p>
        <nav className="space-y-1">
          {sideItems.map(({ label, icon: Icon, path }) => (
            <NavLink
              key={label}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-bold border-l-4 border-teal-600 shadow-2xs'
                    : 'text-slate-700 font-medium hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Clinician badge at bottom of sidebar */}
      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 font-bold text-white text-xs">
            DR
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900">Dr. Practitioner</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">MBBS, MD • OPD 1</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

// Mobile bottom navigation component for smaller screen viewports
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-slate-200 bg-white py-2 shadow-md md:hidden">
      {bottomItems.map(({ label, icon: Icon, path }) => (
        <NavLink
          key={label}
          to={path}
          end={path === '/'}
          aria-label={label}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[10px] font-medium transition ${
              isActive ? 'text-teal-700 font-bold' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <Icon className="h-4.5 w-4.5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
