import { CheckCircle2, FileText, Plus, ShieldCheck, Thermometer, User } from 'lucide-react'
import MedicineCard from './MedicineCard'
import { missingFields } from '../../utils/prescription'

/**
 * PrescriptionReview.jsx - Structured Clinical Summary & Formulary Editor (Minimalist Light Clinical)
 */

// Shared Tailwind style classes for form inputs
const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-600 focus:ring-1 focus:ring-teal-600/20'

// Convert array of string items into newline-separated text for textarea display
const toLines = (arr) => (arr || []).join('\n')
// Convert newline-separated textarea text into array of individual strings
const fromLines = (text) => text.split('\n')

// Complete prescription review and editing container for clinician verification and approval
export default function PrescriptionReview({ data, onChange, approved, onApprove }) {
  const temperature =
    data.patient_info?.temperature ||
    data.patient_info?.vitals?.temperature ||
    '101.4°F'

  // Update patient demographic or symptom field in prescription state
  const setPatient = (patch) =>
    onChange({ ...data, patient_info: { ...data.patient_info, ...patch } })

  // Update specific property on an individual medication item
  const setMedicine = (uid, key, value) =>
    onChange({
      ...data,
      prescription: data.prescription.map((m) => {
        if (m.uid !== uid) return m
        const next = { ...m, [key]: value }
        if (key === 'drug_name') {
          next.verified_match = null
          next.requires_review = false
          next.confidence_score = 100
        }
        return next
      }),
    })

  // Remove a medication entry by its unique identifier
  const removeMedicine = (uid) =>
    onChange({
      ...data,
      prescription: data.prescription.filter((m) => m.uid !== uid),
    })

  // Add a blank medication entry with default dosage and schedule
  const addMedicine = () =>
    onChange({
      ...data,
      prescription: [
        ...data.prescription,
        {
          uid: `m${Date.now()}`,
          drug_name: '',
          dosage: '',
          frequency: '1 - 0 - 1',
          timing: 'After meals',
          duration: '3 days',
          verified_match: null,
          confidence_score: 100,
          requires_review: false,
        },
      ],
    })

  // Validation metrics to control doctor approval eligibility
  const missing = data.prescription.flatMap((m) => missingFields(m))
  const pendingReview = data.prescription.filter(
    (m) => m.requires_review || (m.confidence_score ?? 100) < 75
  ).length
  const canApprove =
    data.prescription.length > 0 && missing.length === 0 && pendingReview === 0

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header section with review badge */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Prescription Draft
        </h2>
        <span className="flex items-center gap-1 text-xs text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full font-bold">
          <FileText size={12} className="text-teal-600" /> Ready for Review
        </span>
      </div>

      {/* 1. Patient Demographics, Vitals, and Chief Complaints */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4 space-y-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
          <User size={13} className="text-teal-600" /> Patient Info & Vitals
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Patient name input */}
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">
              Patient Name
            </span>
            <input
              value={data.patient_info?.name || ''}
              onChange={(e) => setPatient({ name: e.target.value })}
              className={inputCls}
              placeholder="e.g. Ramesh Kumar"
            />
          </label>

          {/* Vitals temperature input */}
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-700">
              <Thermometer size={12} className="text-amber-600" /> Temperature
            </span>
            <input
              value={temperature}
              onChange={(e) => setPatient({ temperature: e.target.value })}
              className={`${inputCls} border-amber-300 bg-amber-50/40 text-amber-900 font-mono font-bold`}
              placeholder="101.4°F"
            />
          </label>
        </div>

        {/* Multi-line symptoms and chief complaints textarea */}
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-700">
            Chief Complaints
          </span>
          <textarea
            rows={2}
            value={toLines(data.patient_info?.chief_complaints)}
            onChange={(e) => setPatient({ chief_complaints: fromLines(e.target.value) })}
            className={inputCls}
            placeholder="High fever&#10;Throat pain"
          />
        </label>
      </div>

      {/* 2. Provisional Diagnosis input box */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 sm:p-4">
        <span className="block text-xs font-bold uppercase tracking-wider text-teal-800 mb-1.5">
          Diagnosis
        </span>
        <input
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
          placeholder="Diagnosis (e.g. Acute Upper Respiratory Tract Infection)"
          className="w-full rounded-xl border border-teal-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-teal-600"
        />
      </div>

      {/* 3. Prescribed Medications list with add medicine trigger */}
      <div>
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Medicines ({data.prescription.length})
          </h3>
          <button
            onClick={addMedicine}
            className="flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 transition shadow-2xs"
          >
            <Plus size={13} className="text-teal-600" /> Add Medicine
          </button>
        </div>

        <div className="space-y-2.5">
          {data.prescription.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-500">
              No medicines yet. Click "Add Medicine".
            </p>
          )}
          {data.prescription.map((m) => (
            <MedicineCard
              key={m.uid}
              med={m}
              onChange={setMedicine}
              onRemove={removeMedicine}
            />
          ))}
        </div>
      </div>

      {/* 4. Lifestyle and dietary advice textarea */}
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-700">
          Advice & Instructions
        </span>
        <textarea
          rows={2}
          value={data.advice || ''}
          onChange={(e) => onChange({ ...data, advice: e.target.value })}
          className={inputCls}
          placeholder="Drink warm water, complete the course."
        />
      </label>

      {/* 5. Doctor approval action button and validation warnings */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        {approved ? (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            Approved by Doctor
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onApprove}
              disabled={!canApprove}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 transition"
            >
              <ShieldCheck size={15} /> Approve Prescription
            </button>
            {!canApprove && (
              <p className="text-xs font-bold text-amber-800">
                {pendingReview > 0
                  ? `${pendingReview} item needs verification. `
                  : ''}
                {missing.length > 0 ? 'Fill required fields.' : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
