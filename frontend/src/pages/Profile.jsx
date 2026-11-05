import DashboardLayout from '../components/layout/DashboardLayout'

// Doctor ka profile page
export default function Profile() {
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-2 text-slate-400">Doctor profile aur clinic details.</p>
      <div className="mt-6 rounded-xl bg-panel p-5 text-sm text-slate-300">
        Coming soon – name, clinic, contact.
      </div>
    </DashboardLayout>
  )
}