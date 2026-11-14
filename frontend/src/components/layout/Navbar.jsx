import BrandLogo from '../common/BrandLogo'

// Application top navigation bar (rendered on mobile viewports < 768px)
export default function Navbar() {
  return (
    <header className="md:hidden sticky top-0 inset-x-0 z-30 h-14 bg-white border-b border-[#DCE6DF] px-4 flex items-center justify-between shadow-xs">
      <BrandLogo />

      <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A5D52] bg-[#F3F7F4] border border-[#DCE6DF] px-2.5 py-1 rounded-full">
        <span className="w-2 h-2 rounded-full bg-[#14633F] animate-pulse" />
        <span>OPD active</span>
      </div>
    </header>
  )
}
