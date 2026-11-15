import { useState } from 'react'
import { Check } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'

export default function Settings() {
  const [defaultLang, setDefaultLang] = useState('hi')
  const [autoScroll, setAutoScroll] = useState(true)
  const [saved, setSaved] = useState(false)

  const handleSave = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <DashboardLayout>
      <div className="max-w-xl">
        <div className="pb-6 border-b border-[#DCE6DF]">
          <h1 className="text-xl font-semibold text-[#17211B] tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-sm text-[#4A5D52]">
            Consultation preferences and vernacular defaults
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Default patient voice instruction language
            </span>
            <select
              value={defaultLang}
              onChange={(e) => setDefaultLang(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none transition-colors"
            >
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="ta">Tamil (தமிழ்)</option>
              <option value="te">Telugu (తెలుగు)</option>
              <option value="bn">Bengali (বাংলা)</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="flex items-start gap-3 cursor-pointer py-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-[#DCE6DF] text-[#14633F] accent-[#14633F]"
            />
            <div>
              <span className="block text-sm font-medium text-[#17211B]">
                Automatic transcript scrolling
              </span>
              <span className="block text-xs text-[#4A5D52]">
                Automatically scroll to the newest spoken lines during active consultation
              </span>
            </div>
          </label>

          <div className="pt-4 flex items-center gap-3">
            <button
              type="submit"
              className="btn-primary min-h-[44px] px-6 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-sm font-semibold flex items-center gap-2"
            >
              {saved && <Check className="w-4 h-4" />}
              <span>{saved ? 'Saved' : 'Save preferences'}</span>
            </button>
            {saved && (
              <span className="text-xs text-[#14633F] font-medium">
                Preferences saved.
              </span>
            )}
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
