import Navbar from './Navbar'
import Sidebar, { BottomNav } from './Sidebar'

// Layout wrapper incorporating top Navbar, fixed Sidebar, and responsive main container
export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top Navbar with integrated branding and system status */}
      <Navbar />

      {/* Fixed desktop Sidebar */}
      <Sidebar />

      {/* Main scrollable page content */}
      <div className="pt-14 md:pl-64 flex flex-col min-h-screen">
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Responsive mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
