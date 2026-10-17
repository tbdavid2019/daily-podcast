export interface DialogueCue {
  id: number
  speaker: string
  text: string
}

export interface TimedCue extends DialogueCue {
  start: number
  end: number
  duration: number
}

function padZero(num: number, size = 2): string {
  let s = Math.floor(num).toString()
  while (s.length < size) {
    s = `0${s}`
  }
  return s
}

export function formatVttTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)

  return `${padZero(h)}:${padZero(m)}:${padZero(s)}.${padZero(ms, 3)}`
}

export function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)

  return `${padZero(h)}:${padZero(m)}:${padZero(s)},${padZero(ms, 3)}`
}

export function parseDialogueLines(
  podcastContent?: string,
  rawDialogue?: { speaker?: string, text?: string }[],
): DialogueCue[] {
  if (Array.isArray(rawDialogue) && rawDialogue.length > 0) {
    return rawDialogue
      .filter(item => item && typeof item.text === 'string' && item.text.trim())
      .map((item, idx) => ({
        id: idx + 1,
        speaker: (item.speaker || '').trim(),
        text: (item.text ?? '').trim(),
      }))
  }

  if (!podcastContent) {
    return []
  }

  const blocks = podcastContent.split(/\n\s*\n/)
  const cues: DialogueCue[] = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) {
      continue
    }

    const colonIdx = trimmed.search(/[:：]/)
    if (colonIdx > 0 && !trimmed.slice(0, colonIdx).includes('\n')) {
      cues.push({
        id: cues.length + 1,
        speaker: trimmed.slice(0, colonIdx).trim(),
        text: trimmed.slice(colonIdx + 1).trim(),
      })
    }
    else {
      cues.push({
        id: cues.length + 1,
        speaker: '',
        text: trimmed,
      })
    }
  }

  return cues
}

export function estimateSpeechDuration(cues: DialogueCue[]): number {
  if (cues.length === 0) {
    return 0
  }

  let totalEstimatedSeconds = 0
  for (const cue of cues) {
    const text = cue.text
    const isChinese = /[\u4E00-\u9FA5]/.test(text)
    // Chinese TTS: ~4.2 chars/sec + 0.8s turn pause
    // English TTS: ~14 chars/sec (~2.5 words/sec) + 0.8s turn pause
    const charsPerSec = isChinese ? 4.2 : 14
    const speechTime = Math.max(1.2, text.length / charsPerSec)
    totalEstimatedSeconds += speechTime + 0.8
  }

  return Math.round(totalEstimatedSeconds)
}

export function calculateCueTimings(cues: DialogueCue[], totalDuration?: number): TimedCue[] {
  if (cues.length === 0) {
    return []
  }

  const duration = (typeof totalDuration === 'number' && totalDuration > 0)
    ? totalDuration
    : estimateSpeechDuration(cues)

  // Compute character and pause weight for each turn
  const weights = cues.map((cue) => {
    const textLen = cue.text.length
    const isChinese = /[\u4E00-\u9FA5]/.test(cue.text)
    // Weight proportional to speech time
    const speechWeight = isChinese ? textLen : textLen / 3.3
    return Math.max(2, speechWeight) + 5
  })

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  let accumulatedTime = 0

  return cues.map((cue, index) => {
    const isLast = index === cues.length - 1
    const cueWeight = weights[index]
    const cueDuration = isLast
      ? Math.max(0.5, duration - accumulatedTime)
      : (cueWeight / totalWeight) * duration

    const start = Math.round(accumulatedTime * 100) / 100
    accumulatedTime += cueDuration
    const end = isLast
      ? Math.round(Math.max(start + 0.5, duration) * 100) / 100
      : Math.round(accumulatedTime * 100) / 100

    return {
      ...cue,
      start,
      end,
      duration: Math.round((end - start) * 100) / 100,
    }
  })
}

export function generateWebVTT(cues: TimedCue[], title?: string): string {
  const lines: string[] = []
  lines.push('WEBVTT')
  if (title) {
    lines.push(`NOTE Title: ${title.replace(/\n/g, ' ')}`)
  }
  lines.push('')

  for (const cue of cues) {
    lines.push(`${cue.id}`)
    lines.push(`${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`)
    const speakerPrefix = cue.speaker ? `<v ${cue.speaker}>` : ''
    lines.push(`${speakerPrefix}${cue.text}`)
    lines.push('')
  }

  return lines.join('\n')
}

export function generateSRT(cues: TimedCue[]): string {
  const lines: string[] = []

  for (const cue of cues) {
    lines.push(`${cue.id}`)
    lines.push(`${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`)
    const speakerPrefix = cue.speaker ? `${cue.speaker}: ` : ''
    lines.push(`${speakerPrefix}${cue.text}`)
    lines.push('')
  }

  return lines.join('\n')
}

export function getTranscriptPath(date: string, variant?: string, format: 'vtt' | 'srt' = 'vtt'): string {
  const isNamedVariant = variant && variant !== 'hacker-news'
  const basePath = `/post/${encodeURIComponent(date)}`
  return isNamedVariant
    ? `${basePath}/${encodeURIComponent(variant)}/transcript.${format}`
    : `${basePath}/transcript.${format}`
}
