import Navbar from './Navbar'
import Sidebar, { BottomNav } from './Sidebar'

// Common layout – Navbar + Sidebar + BottomNav
export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <Navbar />
      <div className="mx-auto flex max-w-6xl gap-6 p-4 md:p-6">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}