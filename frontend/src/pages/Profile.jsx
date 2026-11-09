import DashboardLayout from '../components/layout/DashboardLayout'

// Clinician Profile page showing doctor credentials and system details
export default function Profile() {
  return (
    <DashboardLayout>
      {/* Page title and subtitle */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Doctor Profile</h1>
        <p className="mt-0.5 text-xs font-medium text-slate-500">Clinician credentials.</p>
      </div>

      {/* Clinician information card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs max-w-md">
        {/* Clinician avatar, name, and OPD license status badge */}
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-extrabold text-base border border-teal-200">
            DR
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Dr. Practitioner</h3>
            <p className="text-xs font-semibold text-slate-600">MBBS, MD • General Medicine</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active OPD License
            </span>
          </div>
        </div>

        {/* Practice center and speech engine integration specifications */}
        <div className="mt-3.5 space-y-2 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Facility</span>
            <span className="font-bold text-slate-900">Dhanvantari Health Center</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Speech Engine</span>
            <span className="font-bold text-slate-900">Gnani Prisma STT (Indic Vernacular)</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
