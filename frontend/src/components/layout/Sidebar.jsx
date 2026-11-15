import { NavLink } from 'react-router-dom'
import {
  Mic,
  LayoutDashboard,
  FileText,
  User,
} from 'lucide-react'
import BrandLogo from '../common/BrandLogo'

// Primary navigation link definitions
const navItems = [
  { label: 'Consultation',           icon: Mic,              path: '/consultation' },
  { label: 'Dashboard',              icon: LayoutDashboard, path: '/' },
  { label: 'Prescription history',   icon: FileText,         path: '/prescriptions' },
  { label: 'Doctor profile',         icon: User,             path: '/profile' },
]

// Desktop slim icon-only sidebar (w-16, #F3F7F4)
export default function Sidebar() {
  return (
    <aside
      aria-label="Application navigation"
      className="hidden md:flex w-16 shrink-0 fixed top-0 bottom-0 left-0 z-30 flex-col justify-between items-center py-4 bg-[#F3F7F4] border-r border-[#DCE6DF]"
    >
      {/* Top brand icon */}
      <div className="flex flex-col items-center w-full px-2">
        <NavLink
          to="/"
          title="DocScribeAI Home"
          aria-label="DocScribeAI home"
          className="group min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-[#14633F] border-b border-[#DCE6DF] pb-3 mb-3 w-full"
        >
          <BrandLogo collapsed />
        </NavLink>

        {/* Navigation icon items */}
        <nav className="flex flex-col items-center gap-2 w-full">
          {navItems.map(({ label, icon: Icon, path }) => (
            <NavLink
              key={label}
              to={path}
              end={path === '/'}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                `w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white text-[#14633F] border border-[#DCE6DF]'
                    : 'text-[#4A5D52] hover:text-[#17211B] hover:bg-white'
                }`
              }
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Bottom clinician indicator */}
      <div className="flex flex-col items-center pb-1">
        <NavLink
          to="/profile"
          title="Dr. Practitioner"
          aria-label="Dr. Practitioner profile"
          className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white border border-[#DCE6DF] text-[#14633F] text-xs font-medium"
        >
          DR
        </NavLink>
      </div>
    </aside>
  )
}

// Mobile bottom navigation bar (< 768px)
export function BottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 h-16 bg-[#F3F7F4] border-t border-[#DCE6DF] pb-safe flex items-center justify-between px-1 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]"
    >
      {navItems.map(({ label, icon: Icon, path }) => (
        <NavLink
          key={label}
          to={path}
          end={path === '/'}
          aria-label={label}
          className={({ isActive }) =>
            `flex-1 min-h-[44px] py-1 flex flex-col items-center justify-center gap-0.5 text-[11px] rounded-lg transition-all duration-150 active:scale-95 ${
              isActive
                ? 'text-[#14633F] font-semibold bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                : 'text-[#4A5D52] hover:text-[#17211B]'
            }`
          }
        >
          <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
          <span className="truncate max-w-[72px] tracking-tight">{label.split(' ')[0]}</span>
        </NavLink>
      ))}
    </nav>
  )
}
