// Backend ke bina UI test karne ke liye nakli data

// Day 3: nakli consultation (live transcript)
export const MOCK_TRANSCRIPT = [
  { speaker: 'Doctor', text: 'Namaste, boliye, aapko kya taklif hai?' },
  { speaker: 'Patient', text: 'Doctor sahab, teen din se bukhar hai aur gale mein dard bhi hai.' },
  { speaker: 'Doctor', text: 'Kitna bukhar aa raha hai? Khansi ya sardi bhi hai?' },
  { speaker: 'Patient', text: 'Raat ko 101 tak jata hai. Halki khansi hai, sardi nahi.' },
  { speaker: 'Doctor', text: 'Theek hai. Gala dekhte hain. Tonsils mein halki sujan hai.' },
  { speaker: 'Doctor', text: 'Main teen dawai likh raha hoon, paanch din tak leni hain.' },
]

// Day 4: prescription ka shape = backend ka PrescriptionExtractionResponse (schemas/prescription.py).
// Backend ke STRUCTURED_CARDS message ka "payload" bilkul aisa hi aayega.
export const MOCK_PRESCRIPTION = {
  patient_info: {
    name: 'Ramesh',
    chief_complaints: ['High fever (101.5°F)', 'Severe throat pain', 'Difficulty swallowing'],
  },
  clinical_findings: { diagnosis: 'Acute Throat Infection' },
  prescription: [
    { drug_name: 'Paracetamol 650mg', dosage: '1 tablet', frequency: '1 - 1 - 1', timing: 'After meals', duration: '3 days', verified_match: 'Paracetamol 650mg', confidence_score: 100, requires_review: false },
    { drug_name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: '1 - 0 - 1', timing: 'After meals', duration: '5 days', verified_match: 'Amoxicillin 500mg', confidence_score: 100, requires_review: false },
    // Ye jaan-boojhkar "gadbad" wali hai: review flag aur khali dosage UI mein test karne ke liye
    { drug_name: 'Pantaprazole 40mg', dosage: '', frequency: '1 - 0 - 0', timing: 'Before food', duration: '5 days', verified_match: 'Pantoprazole 40mg', confidence_score: 88.5, requires_review: true },
  ],
  advice: 'Gargle with warm water twice daily',
}