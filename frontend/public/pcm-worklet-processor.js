/* global AudioWorkletProcessor, sampleRate, registerProcessor */

/**
 * pcm-worklet-processor.js
 *
 * Dedicated AudioWorkletProcessor running on Web Audio rendering thread.
 * 1. Downsamples incoming Float32 audio to 16,000 Hz mono.
 * 2. Quantizes samples to 16-bit linear PCM (Int16Array).
 * 3. Accumulates and flushes exact 512-sample (1024-byte / 32ms) frames.
 * 4. Gated by client-side VAD with tuned onset sensitivity and 1-frame pre-roll.
 * 5. Uses zero-copy Transferable ArrayBuffer dispatch via postMessage.
 */

class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetSampleRate = 16000
    this.sourceRatio = sampleRate / 16000
    this.phase = 1.0
    this.prevSample = 0
    this.pcmBuffer = new Int16Array(512)
    this.pcmIndex = 0

    // VAD settings
    this.vadThreshold = 0.0035 // Sensitive enough for soft initial consonants
    this.hangoverMax = 20 // 20 frames * 32ms = ~640ms hangover to prevent syllable clipping
    this.hangoverCount = 0
    this.preRollBuffer = null // 1-frame pre-roll (32ms) to prevent initial consonant onset clipping
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0] || input[0].length === 0) return true
    const channelData = input[0]
    const len = channelData.length

    // Downsample channelData (at sampleRate) to 16kHz
    const ratio = this.sourceRatio
    let t = this.phase

    while (t < len) {
      const i0 = Math.floor(t)
      const frac = t - i0
      const s0 = i0 === 0 ? this.prevSample : channelData[i0 - 1]
      const s1 = channelData[i0]
      const interpolated = s0 + frac * (s1 - s0)

      // Convert float32 [-1.0, 1.0] to signed 16-bit Linear PCM
      const clamped = Math.max(-1, Math.min(1, interpolated))
      const pcmVal = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      this.pcmBuffer[this.pcmIndex++] = Math.round(pcmVal)

      // Flush exact 512-sample (1024-byte / 32ms) frame
      if (this.pcmIndex === 512) {
        this.flushFrame()
      }

      t += ratio
    }

    this.phase = t - len
    this.prevSample = channelData[len - 1]
    return true
  }

  flushFrame() {
    // Energy calculation (RMS) over the 512-sample frame
    let sum = 0
    for (let i = 0; i < 512; i++) {
      const norm = this.pcmBuffer[i] / 32768.0
      sum += norm * norm
    }
    const rms = Math.sqrt(sum / 512)

    const isSpeech = rms >= this.vadThreshold

    if (isSpeech) {
      // If entering speech from silence, flush pre-roll frame first to preserve consonant onset
      if (this.hangoverCount === 0 && this.preRollBuffer) {
        const pre = this.preRollBuffer
        this.port.postMessage(pre, [pre])
        this.preRollBuffer = null
      }
      this.hangoverCount = this.hangoverMax
      const buf = this.pcmBuffer.buffer
      this.port.postMessage(buf, [buf])
    } else if (this.hangoverCount > 0) {
      // Hangover decay
      this.hangoverCount--
      const buf = this.pcmBuffer.buffer
      this.port.postMessage(buf, [buf])
    } else {
      // Silence: retain 1-frame pre-roll copy
      const copy = new Int16Array(this.pcmBuffer)
      this.preRollBuffer = copy.buffer
    }

    this.pcmBuffer = new Int16Array(512)
    this.pcmIndex = 0
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor)
