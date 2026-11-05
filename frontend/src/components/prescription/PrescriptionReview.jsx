import { CheckCircle2, Plus, ShieldCheck } from 'lucide-react'
import MedicineCard from './MedicineCard'
import { missingFields } from '../../utils/prescription'

const inputCls = 'w-full rounded-lg border border-slate-700 bg-ink px-3 py-2 text-sm outline-none focus:border-brand'

// Textarea mein har line = ek complaint
const toLines = (arr) => (arr || []).join('\n')
const fromLines = (text) => text.split('\n')

/**
 * Props:
 *  data      -> prescription (backend schema, har medicine par uid)
 *  onChange  -> poora naya prescription object
 *  approved  -> doctor approve kar chuka hai ya nahi
 *  onApprove -> "Approve" button
 */
export default function PrescriptionReview({ data, onChange, approved, onApprove }) {
  // State ko seedha badalte nahi, hamesha naya copy banate hain (immutable)
  const setPatient = (patch) => onChange({ ...data, patient_info: { ...data.patient_info, ...patch } })

  const setMedicine = (uid, key, value) =>
    onChange({
      ...data,
      prescription: data.prescription.map((m) => {
        if (m.uid !== uid) return m
        const next = { ...m, [key]: value }
        // Doctor ne naam khud sahi kiya: purana fuzzy match hata do. Backend PDF/voice mein
        // verified_match ko drug_name se PEHLE use karta hai, warna purana naam hi chhap jaata
        if (key === 'drug_name') {
          next.verified_match = null
          next.requires_review = false
          next.confidence_score = 100
        }
        return next
      }),
    })

  const removeMedicine = (uid) => onChange({ ...data, prescription: data.prescription.filter((m) => m.uid !== uid) })
  const addMedicine = () =>
    onChange({
      ...data,
      prescription: [
        ...data.prescription,
        { uid: `m${Date.now()}`, drug_name: '', dosage: '', frequency: '', timing: 'After meals', duration: '', verified_match: null, confidence_score: 100, requires_review: false },
      ],
    })

  const missing = data.prescription.flatMap((m) => missingFields(m))
  const pendingReview = data.prescription.filter((m) => m.requires_review).length
  const canApprove = data.prescription.length > 0 && missing.length === 0 && pendingReview === 0

  return (
    <section className="rounded-xl bg-panel p-5">
      <h2 className="text-lg font-semibold">Prescription review</h2>
      <p className="mt-1 text-sm text-slate-400">Ye AI ne extract kiya hai. Galtiyan ho sakti hain, isliye har field check karke approve karein.</p>

      <h3 className="mt-5 text-sm font-medium text-brand">Patient aur diagnosis</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Patient ka naam</span>
          <input value={data.patient_info.name || ''} onChange={(e) => setPatient({ name: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Diagnosis</span>
          <input
            value={data.clinical_findings.diagnosis || ''}
            onChange={(e) => onChange({ ...data, clinical_findings: { ...data.clinical_findings, diagnosis: e.target.value } })}
            className={inputCls}
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-brand">Chief complaints (ek line = ek complaint)</span>
        <textarea rows={3} value={toLines(data.patient_info.chief_complaints)} onChange={(e) => setPatient({ chief_complaints: fromLines(e.target.value) })} className={inputCls} />
      </label>

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-sm font-medium text-brand">Medicines ({data.prescription.length})</h3>
        <button onClick={addMedicine} className="flex items-center gap-1 text-sm text-slate-300 hover:text-brand">
          <Plus size={16} /> Dawai jodein
        </button>
      </div>
      <div className="mt-2 space-y-3">
        {data.prescription.length === 0 && <p className="text-sm text-slate-500">Koi dawai nahi mili. "Dawai jodein" se add karein.</p>}
        {data.prescription.map((m) => (
          <MedicineCard key={m.uid} med={m} onChange={setMedicine} onRemove={removeMedicine} />
        ))}
      </div>

      <label className="mt-5 block">
        <span className="mb-1 block text-sm font-medium text-brand">Advice</span>
        <textarea rows={2} value={data.advice || ''} onChange={(e) => onChange({ ...data, advice: e.target.value })} className={inputCls} />
      </label>

      {/* Approval: jab tak approve nahi, aage kuch share nahi hoga */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-700 pt-4">
        {approved ? (
          <p className="flex items-center gap-2 text-sm text-brand">
            <CheckCircle2 size={18} /> Doctor ne approve kar diya. Koi bhi edit karne par dobara approve karna hoga.
          </p>
        ) : (
          <>
            <button
              onClick={onApprove}
              disabled={!canApprove}
              className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ShieldCheck size={18} /> Review karke approve karein
            </button>
            {!canApprove && (
              <p className="text-xs text-amber-300">
                {pendingReview > 0 ? `${pendingReview} dawai ka naam check karna baaki hai ("Naam sahi hai" dabayein ya naam sudhaarein). ` : ''}
                {missing.length > 0 ? 'Zaroori fields bharein.' : ''}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}