import { Plus, Check, ShieldCheck } from 'lucide-react'
import MedicineCard from './MedicineCard'
import { missingFields, evaluateClinicalSafety } from '../../utils/prescription'

/**
 * PrescriptionReview.jsx - The Rx Sheet (Paper-Like Prescription Pad)
 * Font: Source Serif 4 on clinical details, diagnosis, and medicines.
 */

// Ruled paper input style
const paperInputCls =
  'w-full bg-transparent border-b border-[#DCE6DF] px-1 py-1 font-serif text-base text-[#17211B] focus:border-[#14633F] outline-none transition-colors'

const toLines = (arr) => (arr || []).join('\n')
const fromLines = (text) => text.split('\n')

export default function PrescriptionReview({
  data,
  onChange,
  approved,
  onApprove,
  onSendWhatsApp,
}) {
  const temperature =
    data.patient_info?.temperature ||
    data.patient_info?.vitals?.temperature ||
    '98.6°F'

  const setPatient = (patch) =>
    onChange({ ...data, patient_info: { ...data.patient_info, ...patch } })

  const setMedicine = (uid, key, value) => {
    const updated = data.prescription.map((m) => {
      if (m.uid !== uid) return m
      const next = { ...m, [key]: value }
      if (key === 'drug_name') {
        next.verified_match = null
        next.confidence_score = 100
      }
      return next
    })
    onChange({
      ...data,
      prescription: evaluateClinicalSafety(updated),
    })
  }

  const removeMedicine = (uid) => {
    const filtered = data.prescription.filter((m) => m.uid !== uid)
    onChange({
      ...data,
      prescription: evaluateClinicalSafety(filtered),
    })
  }

  const addMedicine = () => {
    const nextList = [
      ...data.prescription,
      {
        uid: `m${Date.now()}`,
        drug_name: '',
        dosage: '',
        frequency: '1 - 0 - 1',
        timing: 'After meals',
        duration: '5 days',
        verified_match: null,
        confidence_score: 100,
        requires_review: false,
        safety_status: 'Verified Safe',
        interaction_alerts: [],
      },
    ]
    onChange({
      ...data,
      prescription: evaluateClinicalSafety(nextList),
    })
  }

  const missing = data.prescription.flatMap((m) => missingFields(m))
  const pendingReview = data.prescription.filter(
    (m) => m.requires_review || (m.confidence_score ?? 100) < 75
  ).length
  const canApprove =
    data.prescription.length > 0 && missing.length === 0 && pendingReview === 0

  const handlePrimaryAction = () => {
    if (!approved) {
      onApprove?.()
    }
    onSendWhatsApp?.()
  }

  const todayStr = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="bg-white min-h-full flex flex-col justify-between p-6 sm:p-8">
      {/* Top Rx Paper Header */}
      <div>
        <div className="flex items-start justify-between border-b-2 border-[#17211B] pb-3 mb-5">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-3xl font-semibold text-[#14633F] italic select-none">
              ℞
            </span>
            <div>
              <h2 className="font-serif text-base font-semibold text-[#17211B] tracking-tight">
                DocScribeAI Health Center
              </h2>
              <p className="text-xs text-[#4A5D52]">Outpatient clinical prescription</p>
            </div>
          </div>
          <div className="text-right text-xs text-[#4A5D52]">
            <span>{todayStr}</span>
          </div>
        </div>

        {/* 1. Patient Demographics & Vitals (clean 1-column on mobile, 3-column on desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 pb-4 border-b border-[#DCE6DF] text-sm">
          <div className="col-span-1 sm:col-span-2 md:col-span-1">
            <span className="block text-xs font-medium text-[#4A5D52]">
              Patient name
            </span>
            <input
              type="text"
              value={data.patient_info?.name || ''}
              onChange={(e) => setPatient({ name: e.target.value })}
              placeholder="Name"
              className={paperInputCls}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[#4A5D52]">
              Temperature
            </span>
            <input
              type="text"
              value={temperature}
              onChange={(e) => setPatient({ temperature: e.target.value })}
              placeholder="98.6°F"
              className={paperInputCls}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[#4A5D52]">
              Symptoms
            </span>
            <input
              type="text"
              value={toLines(data.patient_info?.chief_complaints)}
              onChange={(e) => setPatient({ chief_complaints: fromLines(e.target.value) })}
              placeholder="Fever, cough"
              className={paperInputCls}
            />
          </div>
        </div>

        {/* 2. Provisional Diagnosis */}
        <div className="py-4 border-b border-[#DCE6DF]">
          <span className="block text-xs font-medium text-[#4A5D52] mb-1">
            Provisional diagnosis
          </span>
          <input
            type="text"
            value={data.clinical_findings?.diagnosis || ''}
            onChange={(e) =>
              onChange({
                ...data,
                clinical_findings: {
                  ...data.clinical_findings,
                  diagnosis: e.target.value,
                },
              })
            }
            placeholder="Diagnosis (e.g., Acute bronchitis)"
            className="w-full bg-transparent border-b border-transparent hover:border-[#DCE6DF] focus:border-[#14633F] py-1 font-serif text-lg font-semibold text-[#17211B] outline-none transition-colors"
          />
        </div>

        {/* 3. Prescribed Medicines as Ruled Lines */}
        <div className="py-4">
          <div className="flex items-center justify-between pb-2 mb-2">
            <h3 className="font-serif text-sm font-semibold text-[#17211B]">
              Rx Medicines ({data.prescription.length})
            </h3>
            <button
              type="button"
              onClick={addMedicine}
              className="btn-secondary min-h-[44px] px-3 rounded-lg text-xs font-semibold text-[#14633F] flex items-center gap-1.5 border border-[#DCE6DF] bg-white hover:bg-[#F3F7F4]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Add medicine</span>
            </button>
          </div>

          <div>
            {data.prescription.length === 0 ? (
              <p className="py-6 text-sm text-[#4A5D52] italic text-center">
                Prescribed medicines will appear as the consultation proceeds.
              </p>
            ) : (
              data.prescription.map((med) => (
                <MedicineCard
                  key={med.uid}
                  med={med}
                  onChange={setMedicine}
                  onRemove={removeMedicine}
                />
              ))
            )}
          </div>
        </div>

        {/* 4. Advice & Instructions */}
        <div className="py-4 border-t border-[#DCE6DF]">
          <span className="block text-xs font-medium text-[#4A5D52] mb-1">
            Advice and instructions
          </span>
          <textarea
            rows={2}
            value={data.advice || ''}
            onChange={(e) => onChange({ ...data, advice: e.target.value })}
            placeholder="Drink plenty of fluids, rest adequately, complete full course."
            className="w-full bg-transparent border border-[#DCE6DF] rounded-lg p-2.5 font-serif text-base sm:text-sm text-[#17211B] focus:border-[#14633F] outline-none resize-none transition-colors"
          />
        </div>
      </div>

      {/* 5. Bottom Approval & Send to WhatsApp Primary Action */}
      <div className="pt-6 border-t border-[#DCE6DF]">
        <div className="flex flex-col gap-2">
          {approved ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#14633F] font-medium py-1">
              <Check className="w-4 h-4" />
              <span>Prescription approved by doctor</span>
            </div>
          ) : !canApprove ? (
            <p className="text-xs text-[#B45309] text-center font-medium">
              {pendingReview > 0
                ? `${pendingReview} medicine match needs confirmation.`
                : 'Complete required medicine fields before sending.'}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={!canApprove && !approved}
            className="btn-primary w-full min-h-[48px] rounded-xl bg-[#14633F] text-white hover:bg-[#0D4A2F] font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
            <span>Approve and send to WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  )
}
