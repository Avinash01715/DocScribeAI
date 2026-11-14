import { useState } from 'react'
import { Check } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'

export default function Profile() {
  const [name, setName] = useState('Dr. Practitioner')
  const [qualification, setQualification] = useState('MBBS, MD (General Medicine)')
  const [registration, setRegistration] = useState('MCI-2018-94821')
  const [clinic, setClinic] = useState('DocScribeAI Health Center')
  const [phone, setPhone] = useState('+91 98765 43210')
  const [saved, setSaved] = useState(false)

  const handleSave = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <DashboardLayout>
      <div className="max-w-xl">
        {/* Header */}
        <div className="pb-6 border-b border-[#DCE6DF]">
          <h1 className="text-xl font-semibold text-[#17211B] tracking-tight">
            Doctor profile
          </h1>
          <p className="mt-1 text-sm text-[#4A5D52]">
            Clinician credentials and health facility details for prescription headers
          </p>
        </div>

        {/* Form on #FFFFFF */}
        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Doctor full name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Medical qualifications
            </span>
            <input
              type="text"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Medical registration number
            </span>
            <input
              type="text"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] font-mono focus:border-[#14633F] outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Health facility / clinic name
            </span>
            <input
              type="text"
              value={clinic}
              onChange={(e) => setClinic(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none transition-colors"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-[#4A5D52] mb-1">
              Contact phone
            </span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#DCE6DF] rounded-xl px-3 py-2 text-base sm:text-sm text-[#17211B] font-mono focus:border-[#14633F] outline-none transition-colors"
            />
          </label>

          {/* Single primary Save button */}
          <div className="pt-4 flex items-center gap-3">
            <button
              type="submit"
              className="btn-primary min-h-[44px] px-6 rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] text-sm font-semibold flex items-center gap-2"
            >
              {saved && <Check className="w-4 h-4" />}
              <span>{saved ? 'Saved' : 'Save'}</span>
            </button>

            {saved && (
              <span className="text-xs text-[#14633F] font-medium">
                Profile details updated.
              </span>
            )}
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
