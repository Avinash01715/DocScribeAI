// Medicine ke fields. "required" wale khali hon to doctor approve nahi kar sakta
export const MED_FIELDS = [
  { key: 'drug_name', label: 'Medicine', required: true, span: 'sm:col-span-2' },
  { key: 'dosage', label: 'Dosage', required: true },
  { key: 'frequency', label: 'Frequency (1 - 1 - 1)', required: true },
  { key: 'timing', label: 'Timing', required: false },
  { key: 'duration', label: 'Duration', required: true },
]

// Ek medicine mein kaun si zaroori fields khali hain
export const missingFields = (med) =>
  MED_FIELDS.filter((f) => f.required && !String(med[f.key] || '').trim()).map((f) => f.label)

// Backend ke prescription mein har medicine par frontend-only `uid` lagao (React key ke liye)
export const withUids = (data) => ({
  ...data,
  prescription: (data.prescription || []).map((m, i) => ({ ...m, uid: `m${Date.now()}_${i}` })),
})