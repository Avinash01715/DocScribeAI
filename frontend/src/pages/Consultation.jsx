import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import PrescriptionReview from '../components/prescription/PrescriptionReview'
import useWebSocket from '../hooks/useWebSocket'
import { MOCK_PRESCRIPTION } from '../data/mockData'
import { withUids } from '../utils/prescription'

let lineId = 0 // har line ki apni unique key

export default function Consultation() {
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false) // Stop ke baad "prescription ban rahi hai"
  const [prescription, setPrescription] = useState(null)
  const [approved, setApproved] = useState(false)
  const timerRef = useRef(null)
  const chunkNo = useRef(0) // chunk ginne ke liye

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT') {
      setLines((prev) => [...prev, { id: ++lineId, speaker: msg.speaker, text: msg.text, is_final: true }])
    }
  }, [])

  const ws = useWebSocket({ mock: true, onMessage: handleMessage })

  // Page chhodte waqt pending timer band
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Doctor ka koi bhi edit: approval hat jaata hai (naye badlav ko dobara check karna padega)
  const handleEdit = (next) => {
    setPrescription(next)
    setApproved(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <AudioRecorder
          disabled={processing}
          onStart={() => {
            chunkNo.current = 0 // <- naya: har recording mein ginti 0 se
            setLines([])
            setPrescription(null)
            setApproved(false)
            ws.connect()
            setRecording(true)
          }}
          onChunk={async (blob) => {
            // <- naya: poora onChunk replace
            chunkNo.current += 1

            // Chunk ke shuru ke 4 bytes hex mein (format pehchanne ke liye)
            const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
            const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join(' ')

            console.log(`chunk #${chunkNo.current}: ${blob.size} bytes | ${blob.type} | starts: ${hex}`)
            ws.send(blob) // pehle jaisa
          }}
          onStop={() => {
            ws.disconnect()
            setRecording(false)
            setProcessing(true)
            // Day 6 mein yahan backend ka STRUCTURED_CARDS aayega. Abhi 1.5s baad nakli prescription
            timerRef.current = setTimeout(() => {
              setPrescription(withUids(MOCK_PRESCRIPTION))
              setProcessing(false)
            }, 1500)
          }}
        />
        <LiveTranscript lines={lines} status={ws.status} error={ws.error} isRecording={recording} />
      </div>

      {processing && (
        <div className="flex items-center gap-3 rounded-xl bg-panel p-5 text-slate-300">
          <Loader2 className="animate-spin text-brand" /> Prescription ban rahi hai…
        </div>
      )}

      {prescription && (
        <PrescriptionReview data={prescription} onChange={handleEdit} approved={approved} onApprove={() => setApproved(true)} />
      )}
    </div>
  )
}