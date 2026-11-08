import { Mic, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'

const recent = [
  { id: '001', status: 'Prescription sent via WhatsApp', time: '10:30 AM' },
  { id: '002', status: 'Pending review',                 time: '09:15 AM' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          {greeting()}, Doctor
        </h1>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          Ready for your patient consultations.
        </p>
      </div>

      {/* Start Consultation Card */}
      <section className="rounded-2xl border border-teal-200/90 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 text-teal-800 text-xs font-bold uppercase tracking-wider">
          <Mic className="h-4 w-4 text-teal-600" />
          <span>New Consultation</span>
        </div>

        <p className="mt-2 text-sm font-medium text-slate-700">
          Record conversation to transcribe and generate prescription automatically.
        </p>

        <button
          onClick={() => navigate('/consultation')}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition"
        >
          <Plus className="h-4 w-4" /> Start Consultation
        </button>
      </section>

      {/* Recent Consultations */}
      <div className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Recent Consultations
        </h2>
        <ul className="mt-2.5 space-y-2">
          {recent.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-slate-300 transition">
              <div>
                <p className="text-xs font-bold text-slate-900">Patient #{c.id}</p>
                <p className="text-[11px] font-medium text-slate-500">{c.status}</p>
              </div>
              <span className="text-[11px] font-medium text-slate-400">{c.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardLayout>
  )
}
