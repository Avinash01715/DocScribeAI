import { Mic, Plus } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'

const recent = [
  { id: '001', status: 'Prescription generated' },
  { id: '002', status: 'Pending review' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">{greeting()}, Doctor 👋</h1>
      <p className="mt-1 text-slate-400">
        <span className="md:hidden">Ready for your next consultation?</span>
        <span className="hidden md:inline">Manage your patient consultations.</span>
      </p>

      <section className="mt-5 rounded-xl bg-brand-dark p-5">
        <Mic className="h-5 w-5 text-brand" />
        <h2 className="mt-3 text-xl font-semibold">
          <span className="md:hidden">New Consultation</span>
          <span className="hidden md:inline">Start Consultation</span>
        </h2>
        <p className="mt-2 text-sm text-slate-200">Record a doctor-patient conversation.</p>
        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-medium text-ink hover:opacity-90">
          <Plus className="hidden h-4 w-4 md:inline" />
          <span className="md:hidden">Start Recording</span>
          <span className="hidden md:inline">New Consultation</span>
        </button>
      </section>

      <h2 className="mt-8 text-lg font-semibold">Recent Consultations</h2>
      <ul className="mt-3 space-y-3">
        {recent.map((c) => (
          <li key={c.id} className="rounded-lg bg-panel p-3">
            <p className="font-medium">Patient consultation #{c.id}</p>
            <p className="text-sm text-slate-400">{c.status}</p>
          </li>
        ))}
      </ul>
    </DashboardLayout>
  )
}