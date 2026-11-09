import DashboardLayout from '../components/layout/DashboardLayout'
import { Settings as SettingsIcon } from 'lucide-react'

// Application Settings page for audio sensitivity and vernacular preferences
export default function Settings() {
  return (
    <DashboardLayout>
      {/* Settings title and subtitle */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="mt-0.5 text-xs font-medium text-slate-500">System preferences.</p>
      </div>

      {/* Preferences placeholder card */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-700 mb-2.5">
          <SettingsIcon size={20} />
        </div>
        <h3 className="text-xs font-bold text-slate-900">Preferences</h3>
        <p className="mt-0.5 text-[11px] font-medium text-slate-400">
          Audio sensitivity and language settings.
        </p>
      </div>
    </DashboardLayout>
  )
}
