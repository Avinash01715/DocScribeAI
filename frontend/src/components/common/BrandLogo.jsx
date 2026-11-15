export default function BrandLogo({ collapsed = false, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        viewBox="0 0 36 36"
        className="w-9 h-9 shrink-0 transition-transform duration-150 ease-out group-hover:scale-[1.03]"
        fill="none"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="32" height="32" rx="9" fill="#14633F" />
        <path
          d="M11 8.5V12.5M9 10.5H13"
          stroke="#FFFFFF"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M10.5 19.5V22.5M14.5 16.5V25.5M18.5 13.5V27.5M22.5 16.5V25.5M26.5 19.5V22.5"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="text-[17px] font-medium tracking-tight text-[#17211B]">
            DocScribe<span className="text-[#14633F]">AI</span>
          </span>
          <span className="text-[11px] text-[#4A5D52] mt-0.5">
            Clinical prescription pad
          </span>
        </div>
      )}
    </div>
  )
}
