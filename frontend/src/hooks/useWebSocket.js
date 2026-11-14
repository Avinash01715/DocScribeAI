import { useCallback, useEffect, useRef, useState } from 'react'
import { MOCK_TRANSCRIPT, MOCK_PRESCRIPTION } from '../data/mockData'

/**
 * useWebSocket.js - Reactive State Coordinator & Bidirectional Transport
 *
 * Implements specifications:
 * 1. Connection lifecycle to ws://127.0.0.1:8000/ws/consultation.
 * 2. Explicit state management:
 *    - connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
 *    - interimTranscript: Unconfirmed streaming speech tokens from Gnani Prisma STT.
 *    - confirmedTranscript: Accumulated finalized consultation text.
 *    - extractedPrescription: Parsed clinical DTO from Evon LLM.
 *    - pipelineStatus: Progress indicators (e.g. "Analyzing clinical dialogue with Evon LLM...").
 * 3. Heartbeat keeping socket active (PING frame every 20s).
 * 4. Exponential backoff auto-reconnect strategy.
 * 5. Direct raw binary frame dispatch for 16kHz PCM chunks without serialization overhead.
 * 6. Action handlers: sendAudioChunk(buffer), triggerProcess(), resetSession().
 */

// Default WebSocket configuration constants and timer thresholds
let rawWs = (import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/ws/consultation').trim()
if (rawWs.startsWith('https://')) {
  rawWs = rawWs.replace('https://', 'wss://')
} else if (rawWs.startsWith('http://')) {
  rawWs = rawWs.replace('http://', 'ws://')
}
rawWs = rawWs.replace(/\/+$/, '')
if (!rawWs.includes('/ws')) {
  rawWs = `${rawWs}/ws/consultation`
}
const DEFAULT_WS_URL = rawWs
const HEARTBEAT_INTERVAL_MS = 20000 // 20s heartbeat keep-alive
const INITIAL_RETRY_DELAY_MS = 1000 // 1s initial exponential backoff delay
const MAX_RETRY_DELAY_MS = 16000 // 16s cap for exponential backoff

// Custom hook managing bidirectional WebSocket streaming connection to backend
export default function useWebSocket({
  url = DEFAULT_WS_URL,
  mock = false,
  onMessage,
  autoReconnect = false,
} = {}) {
  // ---- 1. Specification Managed States ----
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED')
  const [confirmedTranscript, setConfirmedTranscript] = useState('')
  const [extractedPrescription, setExtractedPrescription] = useState(null)
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [error, setError] = useState('')

  // Map state to backward-compatible legacy status string
  const legacyStatus =
    connectionStatus === 'CONNECTED'
      ? 'connected'
      : connectionStatus === 'CONNECTING'
        ? 'connecting'
        : connectionStatus === 'ERROR'
          ? 'error'
          : 'closed'

  // Mutable refs for socket lifecycle, queues, and timer management
  const wsRef = useRef(null)
  const queueRef = useRef([]) // Buffers audio chunks arriving before socket handshake completes
  const sequenceNumberRef = useRef(0) // Monotonic sequence ID counter for audio packets
  const mockTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const retryCountRef = useRef(0)
  const explicitlyClosedRef = useRef(false)
  const onMessageRef = useRef(onMessage)
  const connectRef = useRef(null)

  // Isolated interim speech subscriber listeners (bypasses full tree re-renders)
  const interimTranscriptRef = useRef('')
  const interimSubscribersRef = useRef(new Set())

  const subscribeInterim = useCallback((cb) => {
    if (typeof cb !== 'function') return () => {}
    interimSubscribersRef.current.add(cb)
    cb(interimTranscriptRef.current)
    return () => {
      interimSubscribersRef.current.delete(cb)
    }
  }, [])

  // Keep latest message callback without causing reconnect re-triggers
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  // ---- 2. Socket Heartbeat Management ----
  // Stop active heartbeat timer interval
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  // Start periodic 20-second ping interval to prevent gateway socket timeouts
  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    heartbeatTimerRef.current = setInterval(() => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send lightweight JSON ping to prevent intermediate gateway timeouts
        ws.send(JSON.stringify({ action: 'PING' }))
      }
    }, HEARTBEAT_INTERVAL_MS)
  }, [stopHeartbeat])

  // ---- 3. Disconnection & Cleanup ----
  // Terminate connection, stop heartbeat, clear reconnect timers, and reset status
  const disconnect = useCallback(() => {
    explicitlyClosedRef.current = true
    stopHeartbeat()
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current)
      mockTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onclose = null // Suppress error trigger on intentional close
      wsRef.current.close()
      wsRef.current = null
    }
    queueRef.current = []
    setConnectionStatus('DISCONNECTED')
  }, [stopHeartbeat])

  // ---- 4. Bidirectional Connection Transport ----
  // Connect to target WebSocket endpoint and attach message, open, error, and close listeners
  const connect = useCallback(
    (targetUrl = url) => {
      explicitlyClosedRef.current = false
      sequenceNumberRef.current = 0
      setError('')
      setConnectionStatus('CONNECTING')

      // Mock Mode Fallback: Emulates live STT tokens every 3 seconds for offline development
      if (mock) {
        let i = 0
        setConnectionStatus('CONNECTED')
        mockTimerRef.current = setInterval(() => {
          if (i >= MOCK_TRANSCRIPT.length) {
            clearInterval(mockTimerRef.current)
            return
          }
          const item = MOCK_TRANSCRIPT[i]
          setConfirmedTranscript((prev) => (prev ? `${prev} ${item.text}` : item.text))
          interimTranscriptRef.current = ''
          interimSubscribersRef.current.forEach((cb) => {
            try {
              cb('')
            } catch (err) {
              console.error('Interim subscriber error:', err)
            }
          })
          onMessageRef.current?.({ type: 'TRANSCRIPT', is_final: true, ...item })
          i += 1
        }, 3000)
        return
      }

      // Live WebSocket Transport
      const ws = new WebSocket(targetUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      // Handle successful WebSocket connection handshake
      ws.onopen = () => {
        setConnectionStatus('CONNECTED')
        retryCountRef.current = 0 // Reset exponential backoff on successful handshake
        startHeartbeat()

        // Flush any queued audio buffers accumulated during connection handshake
        if (queueRef.current.length > 0) {
          queueRef.current.forEach((chunk) => ws.send(chunk))
          queueRef.current = []
        }
      }

      // Handle incoming message frames from backend
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          // Frame 1: TRANSCRIPT_UPDATE / TRANSCRIPT
          // Updates interim partial speech tokens and accumulates finalized clinical sentences
          if (msg.type === 'TRANSCRIPT_UPDATE' || msg.type === 'TRANSCRIPT') {
            const token = msg.text || msg.interim || ''
            if (msg.is_final) {
              interimTranscriptRef.current = ''
              interimSubscribersRef.current.forEach((cb) => {
                try {
                  cb('')
                } catch (err) {
                  console.error('Interim subscriber error:', err)
                }
              })
              if (msg.transcript) {
                setConfirmedTranscript(msg.transcript)
              } else if (token) {
                setConfirmedTranscript((prev) => (prev ? `${prev} ${token}` : token))
              }
            } else {
              interimTranscriptRef.current = token
              interimSubscribersRef.current.forEach((cb) => {
                try {
                  cb(token)
                } catch (err) {
                  console.error('Interim subscriber error:', err)
                }
              })
            }
          }

          // Frame 2: STATUS
          // Updates real-time reasoning progress (e.g., "Analyzing clinical dialogue with Evon LLM...")
          else if (msg.type === 'STATUS') {
            setPipelineStatus(msg.message || '')
          }

          // Frame 3: PRESCRIPTION_EXTRACTED / STRUCTURED_CARDS
          // Populates the clinical DTO (patient_info, clinical_findings, prescription, advice)
          else if (msg.type === 'PRESCRIPTION_EXTRACTED') {
            setExtractedPrescription(msg.data)
            setPipelineStatus('')
          } else if (msg.type === 'STRUCTURED_CARDS') {
            setExtractedPrescription(msg.payload)
            setPipelineStatus('')
          }

          // Relay parsed frame downstream to custom subscriber
          onMessageRef.current?.(msg)
        } catch {
          console.warn('Inbound non-JSON frame received:', event.data)
        }
      }

      // Handle socket errors
      ws.onerror = () => {
        setError('Server se connection nahi ban paya. Internet ya backend check karein.')
        setConnectionStatus('ERROR')
      }

      // Handle socket close and trigger exponential backoff reconnect if needed
      ws.onclose = () => {
        stopHeartbeat()
        if (explicitlyClosedRef.current) {
          setConnectionStatus('DISCONNECTED')
          return
        }

        setConnectionStatus('DISCONNECTED')

        // Exponential backoff reconnect strategy when closed unexpectedly
        if (autoReconnect) {
          const delay = Math.min(
            INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current),
            MAX_RETRY_DELAY_MS
          )
          retryCountRef.current += 1
          reconnectTimerRef.current = setTimeout(() => {
            connectRef.current?.(targetUrl)
          }, delay)
        }
      }
    },
    [url, mock, startHeartbeat, stopHeartbeat, autoReconnect]
  )

  // Keep connect ref current for the timeout callback
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  // ---- 5. Binary Audio Dispatch Handler ----
  // Dispatch raw binary 16kHz PCM audio buffer directly over socket without JSON overhead
  const sendAudioChunk = useCallback(
    (buffer) => {
      if (mock) return true

      // Tag chunk with monotonic sequence counter (0, 1, 2...)
      const seq = sequenceNumberRef.current++
      const rawBytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer)
      const packet = new Uint8Array(4 + rawBytes.byteLength)
      const view = new DataView(packet.buffer)
      view.setUint32(0, seq, false) // 4-byte Big-Endian unsigned integer
      packet.set(rawBytes, 4)
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(packet.buffer)
        return true
      }
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        queueRef.current.push(packet.buffer)
        return true
      }
      return false
    },
    [mock]
  )

  // Backward compatibility alias for sending data chunks
  const send = useCallback(
    (data) => {
      return sendAudioChunk(data)
    },
    [sendAudioChunk]
  )

  // ---- 6. Action Handlers ----
  // Send PROCESS action frame to backend to trigger LLM prescription extraction
  const triggerProcess = useCallback(
    (customTranscript) => {
      setPipelineStatus('Analyzing clinical dialogue with Evon LLM...')
      const payload = {
        action: 'PROCESS',
        transcript: customTranscript || confirmedTranscript,
      }
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload))
      } else if (mock) {
        setTimeout(() => {
          setExtractedPrescription(MOCK_PRESCRIPTION)
          setPipelineStatus('')
        }, 1500)
      }
    },
    [confirmedTranscript, mock]
  )

  // Send RESET action frame to flush consultation buffer on backend and clear local state
  const resetSession = useCallback(() => {
    sequenceNumberRef.current = 0
    interimTranscriptRef.current = ''
    interimSubscribersRef.current.forEach((cb) => {
      try {
        cb('')
      } catch (err) {
        console.error('Interim subscriber error:', err)
      }
    })
    setConfirmedTranscript('')
    setExtractedPrescription(null)
    setPipelineStatus('')
    setError('')
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'RESET' }))
    }
  }, [])

  // Disconnect WebSocket connection when component unmounts
  useEffect(() => disconnect, [disconnect])

  return {
    // Managed States as per Specification
    connectionStatus,
    get interimTranscript() {
      return interimTranscriptRef.current
    },
    confirmedTranscript,
    extractedPrescription,
    pipelineStatus,
    error,
    // Backward Compatibility aliases
    status: legacyStatus,
    // Fast subscriber for LiveTranscript (zero parent re-renders)
    subscribeInterim,
    // Action Handlers
    sendAudioChunk,
    triggerProcess,
    resetSession,
    connect,
    disconnect,
    send,
  }
}
