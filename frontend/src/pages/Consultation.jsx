import AudioRecorder from '../components/consultation/AudioRecorder'

// test version: sirf console mein dikhata hai ki chunks aa rahe hain
export default function Consultation() {
  return (
    <AudioRecorder
      onChunk={(blob) => console.log('chunk aaya:', blob.size, 'bytes')}
      onStop={(blob) => console.log('recording khatam:', blob.size, 'bytes,', blob.type)}
    />
  )
}