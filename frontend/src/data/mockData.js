// Mock consultation transcript lines for offline simulation and UI testing
export const MOCK_TRANSCRIPT = [
  { speaker: 'Doctor', text: 'Namaste, boliye, aapko kya taklif hai?' },
  { speaker: 'Patient', text: 'Doctor sahab, teen din se bukhar hai aur gale mein dard bhi hai.' },
  { speaker: 'Doctor', text: 'Kitna bukhar aa raha hai? Khansi ya sardi bhi hai?' },
  { speaker: 'Patient', text: 'Raat ko 101 tak jata hai. Halki khansi hai, sardi nahi.' },
  { speaker: 'Doctor', text: 'Theek hai. Gala dekhte hain. Tonsils mein halki sujan hai.' },
  { speaker: 'Doctor', text: 'Main teen dawai likh raha hoon, paanch din tak leni hain.' },
]

// Mock structured prescription payload matching the backend schema
export const MOCK_PRESCRIPTION = {
  patient_info: {
    name: 'Ramesh',
    chief_complaints: ['High fever (101.5°F)', 'Severe throat pain', 'Difficulty swallowing'],
  },
  clinical_findings: { diagnosis: 'Acute Throat Infection' },
  prescription: [
    { drug_name: 'Paracetamol 650mg', dosage: '1 tablet', frequency: '1 - 1 - 1', timing: 'After meals', duration: '3 days', verified_match: 'Paracetamol 650mg', confidence_score: 100, requires_review: false, safety_status: 'Verified Safe', interaction_alerts: [] },
    { drug_name: 'Aspirin 75mg', dosage: '1 tablet', frequency: '1 - 0 - 0', timing: 'After meals', duration: '5 days', verified_match: 'Aspirin 75mg', confidence_score: 100, requires_review: true, safety_status: 'DDI_ALERT', interaction_alerts: ['DDI Alert: Contraindicated with Ibuprofen 400mg (Severe risk of gastrointestinal ulceration/bleeding.)'] },
    { drug_name: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: '1 - 0 - 1', timing: 'After meals', duration: '3 days', verified_match: 'Ibuprofen 400mg', confidence_score: 100, requires_review: true, safety_status: 'DDI_ALERT', interaction_alerts: ['DDI Alert: Contraindicated with Aspirin 75mg (Severe risk of gastrointestinal ulceration/bleeding.)'] },
  ],
  advice: 'Gargle with warm water twice daily',
}

// Mock WhatsApp dispatch response payload with audio note and PDF receipt links
export const MOCK_DISPATCH = {
  status: 'success',
  recipient: '919876543210',
  whatsapp_deep_link: 'https://wa.me/919876543210',
  voice_note: {
    audio_url: '/demo/instructions.wav', // Sample 4-second audio in public/demo
    script: 'Ramesh ji, Paracetamol 650mg din mein teen baar khana khane ke baad lein 3 days tak.',
    synthesized: false,
  },
  pdf_receipt: { file_path: 'demo.pdf', url: '/demo/prescription.pdf', status: 'generated' },
}
