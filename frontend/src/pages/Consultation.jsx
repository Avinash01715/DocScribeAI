import { useCallback, useState } from 'react'
import AudioRecorder from '../components/consultation/AudioRecorder'
import LiveTranscript from '../components/consultation/LiveTranscript'
import useWebSocket from '../hooks/useWebSocket'

let lineId = 0 // har line ki apni unique key

export default function Consultation() {
  const [lines, setLines] = useState([])
  const [recording, setRecording] = useState(false)

  // Hook se aaya har message yahan pahunchta hai
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'TRANSCRIPT') {
      setLines((prev) => [...prev, { id: ++lineId, speaker: msg.speaker, text: msg.text, is_final: true }])
    }
  }, [])

  // mock: true = nakli transcript. Day 6 mein isko false karenge
  const ws = useWebSocket({ mock: true, onMessage: handleMessage })

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <AudioRecorder
        onStart={() => {
          setLines([]) // purana transcript saaf
          ws.connect() // call lagao
          setRecording(true)
        }}
        onChunk={(blob) => ws.send(blob)} // har second ka audio line par bhejo
        onStop={(blob) => {
          console.log('Recording khatam:', blob.size, 'bytes,', blob.type)
          ws.disconnect() // call kaato
          setRecording(false)
        }}
      />
      <LiveTranscript lines={lines} status={ws.status} error={ws.error} isRecording={recording} />
    </div>
  )
}