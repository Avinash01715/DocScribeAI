import DashboardLayout from '../components/layout/DashboardLayout'
import { FileText } from 'lucide-react'

export default function Prescriptions() {
  return (
    <DashboardLayout>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Prescriptions</h1>
        <p className="mt-0.5 text-xs font-medium text-slate-500">Patient records archive.</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-xs">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-teal-600 mb-2.5">
          <FileText size={20} />
        </div>
        <h3 className="text-xs font-bold text-slate-900">No prescriptions yet</h3>
        <p className="mt-0.5 text-[11px] font-medium text-slate-400">
          Generated prescriptions will appear here.
        </p>
      </div>
    </DashboardLayout>
  )
}
