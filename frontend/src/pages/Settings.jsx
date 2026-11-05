import DashboardLayout from '../components/layout/DashboardLayout'

// Settings page – abhi empty
export default function Settings() {
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-2 text-slate-400">App settings yahan aayenge.</p>
      <div className="mt-6 rounded-xl bg-panel p-5 text-sm text-slate-300">
        Coming soon – language, mic, notification preferences.
      </div>
    </DashboardLayout>
  )
}