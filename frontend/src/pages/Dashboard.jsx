import { Mic, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'

// Today's outpatient consultation records
const consultations = [
  { id: '1', patient: 'Ramesh Kumar', time: '10:30 AM', diagnosis: 'Acute bronchitis', status: 'Sent to WhatsApp' },
  { id: '2', patient: 'Sunita Devi',  time: '09:45 AM', diagnosis: 'Type 2 diabetes review', status: 'Prescription approved' },
  { id: '3', patient: 'Amit Patel',   time: '09:15 AM', diagnosis: 'Hypertension follow-up', status: 'Archived' },
]

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <DashboardLayout>
      {/* Page header and single primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#DCE6DF]">
        <div>
          <h1 className="text-xl font-semibold text-[#17211B] tracking-tight">
            Consultations
          </h1>
          <p className="mt-1 text-sm text-[#4A5D52]">
            Today's outpatient clinic schedule and completed records
          </p>
        </div>

        {/* Single Primary Action */}
        <button
          type="button"
          onClick={() => navigate('/consultation')}
          className="btn-primary min-h-[44px] px-5 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-sm font-semibold flex items-center gap-2 self-start sm:self-auto"
        >
          <Mic className="w-4 h-4" strokeWidth={1.75} />
          <span>Start consultation</span>
        </button>
      </div>

      {/* Quiet consultations list/table */}
      <div className="mt-6 border border-[#DCE6DF] rounded-xl overflow-hidden bg-white">
        {/* Mobile Ruled List View (< 768px) */}
        <div className="md:hidden divide-y divide-[#DCE6DF]">
          {consultations.map((item) => (
            <div key={item.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-[#17211B]">{item.patient}</span>
                <span className="font-mono text-xs text-[#4A5D52]">{item.time}</span>
              </div>
              <p className="font-serif text-sm text-[#4A5D52]">{item.diagnosis}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F3F7F4] border border-[#DCE6DF] text-[#14633F]">
                  {item.status}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/prescriptions')}
                  className="btn-secondary min-h-[36px] px-3 rounded-lg border border-[#DCE6DF] text-xs font-semibold text-[#14633F] inline-flex items-center gap-1"
                >
                  <span>View</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (md:) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F3F7F4] border-b border-[#DCE6DF] text-xs font-medium text-[#4A5D52]">
              <tr>
                <th scope="col" className="px-4 py-3">Patient</th>
                <th scope="col" className="px-4 py-3">Diagnosis</th>
                <th scope="col" className="px-4 py-3">Time</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE6DF]">
              {consultations.map((item) => (
                <tr key={item.id} className="hover:bg-[#F3F7F4]/50 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-[#17211B]">
                    {item.patient}
                  </td>
                  <td className="px-4 py-3.5 font-serif text-[#4A5D52]">
                    {item.diagnosis}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#4A5D52] font-mono">
                    {item.time}
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#F3F7F4] border border-[#DCE6DF] text-[#17211B]">
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => navigate('/prescriptions')}
                      className="inline-flex items-center gap-1 text-xs text-[#14633F] hover:text-[#0D4A2F] font-medium"
                    >
                      <span>View</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
