import Navbar from './Navbar'
import Sidebar, { BottomNav } from './Sidebar'

// Application layout wrapper with slim sidebar on desktop and mobile bottom navigation
export default function DashboardLayout({ children, fullWidth = false }) {
  return (
    <div className="min-h-screen bg-white text-[#17211B]">
      {/* Mobile top header */}
      <Navbar />

      {/* Desktop slim sidebar rail (w-16) */}
      <Sidebar />

      {/* Main content container */}
      <div className="md:pl-16 flex flex-col min-h-screen">
        <main
          className={`flex-1 ${
            fullWidth
              ? 'w-full'
              : 'p-4 md:p-8 max-w-5xl w-full mx-auto pb-20 md:pb-8'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  )
}
