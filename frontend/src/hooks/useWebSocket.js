import { useCallback, useEffect, useRef, useState } from 'react'
import { MOCK_TRANSCRIPT } from '../data/mockData'

/**
 * Use:  const ws = useWebSocket({ mock: true, onMessage })
 *       ws.connect(url)   ws.send(data)   ws.disconnect()
 *       ws.status -> idle | connecting | connected | closed | error
 *
 * Backend se aane wale messages (tay hua contract):
 *   { type: 'TRANSCRIPT', text, speaker, is_final }    <- live transcript
 *   { type: 'STRUCTURED_CARDS', payload: {...} }       <- prescription (Day 4+)
 */
export default function useWebSocket({ mock = false, onMessage } = {}) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const wsRef = useRef(null)
  const queueRef = useRef([]) // socket khulne se pehle aaya data yahan ruka rehta hai
  const mockTimerRef = useRef(null)
  const onMessageRef = useRef(onMessage)

  // Hamesha sabse naya callback yaad rahe (purana/stale na chale)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const disconnect = useCallback(() => {
    clearInterval(mockTimerRef.current)
    if (wsRef.current) {
      wsRef.current.onclose = null // jaan-boojhkar band kiya, error mat samjho
      wsRef.current.close()
      wsRef.current = null
    }
    queueRef.current = []
    setStatus('closed')
  }, [])

  const connect = useCallback(
    (url) => {
      setError('')
      setStatus('connecting')

      // ---- MOCK: backend ke bina har 3 second mein ek line ----
      if (mock) {
        let i = 0
        setStatus('connected')
        mockTimerRef.current = setInterval(() => {
          if (i >= MOCK_TRANSCRIPT.length) return clearInterval(mockTimerRef.current)
          onMessageRef.current?.({ type: 'TRANSCRIPT', is_final: true, ...MOCK_TRANSCRIPT[i] })
          i += 1
        }, 3000)
        return
      }

      // ---- ASLI: Day 6 mein ye chalega ----
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        // Pehla audio chunk header jaisa hota hai, isliye gira nahi sakte: jo ruka tha wo ab bhejo
        queueRef.current.forEach((d) => ws.send(d))
        queueRef.current = []
      }
      ws.onmessage = (event) => {
        try {
          onMessageRef.current?.(JSON.parse(event.data))
        } catch {
          console.warn('Backend se invalid JSON aaya:', event.data)
        }
      }
      ws.onerror = () => {
        setError('Server se connection nahi ban paya. Internet ya backend check karein.')
        setStatus('error')
      }
      ws.onclose = () => setStatus((s) => (s === 'error' ? s : 'closed'))
    },
    [mock]
  )

  // send() hamesha ek hi function rehta hai (useCallback), taaki AudioRecorder
  // ke andar purana yaad kiya hua send() bhi sahi kaam kare
  const send = useCallback(
    (data) => {
      if (mock) return true
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data)
        return true
      }
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        queueRef.current.push(data)
        return true
      }
      return false
    },
    [mock]
  )

  useEffect(() => disconnect, [disconnect]) // page chhodte waqt call kaat do

  return { status, error, connect, disconnect, send }
}