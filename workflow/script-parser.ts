import type { PodcastDialogueLine, PodcastScriptResponse } from './types'
import { z } from 'zod'
import { MAX_DIALOGUE_LINE_CHARS, splitDialogueText } from './efficiency'

const rawDialogueItemSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
})

const rawPodcastScriptSchema = z.object({
  title: z.string().nullable().optional(),
  dialogue: z.array(rawDialogueItemSchema).min(1),
})

function truncatePreview(value: string, maxLength = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`
}

/**
 * Normalizes flexible host labels (e.g. "女", "Cordelia", "Cordelia（女）",
 * "男主持人", "David / 男") into the canonical '女' | '男' speaker tokens.
 */
export function normalizePodcastSpeaker(rawSpeaker: string): PodcastDialogueLine['speaker'] | null {
  const cleaned = rawSpeaker
    .replace(/^[\s"'`「『【[(*#]+|[\s"'`」』】\])*#]+$/g, '')
    .trim()
  if (!cleaned) {
    return null
  }

  const lower = cleaned.toLowerCase()
  const hasFemaleToken = cleaned === '女'
    || lower === 'female'
    || lower === 'woman'
    || lower.includes('cordelia')
    || (cleaned.includes('女') && !cleaned.includes('男'))
  const hasMaleToken = cleaned === '男'
    || lower === 'male'
    || lower === 'man'
    || lower.includes('david')
    || (cleaned.includes('男') && !cleaned.includes('女'))

  if (hasFemaleToken && !hasMaleToken) {
    return '女'
  }
  if (hasMaleToken && !hasFemaleToken) {
    return '男'
  }
  return null
}

/**
 * Escapes raw control characters (newlines/tabs) that appear inside JSON string literals
 * and removes trailing commas before closing brackets/braces.
 */
function sanitizeLenientJson(input: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (inString) {
      if (escaped) {
        result += ch
        escaped = false
      }
      else if (ch === '\\') {
        result += ch
        escaped = true
      }
      else if (ch === '"') {
        result += ch
        inString = false
      }
      else if (ch === '\n') {
        result += '\\n'
      }
      else if (ch === '\r') {
        result += '\\r'
      }
      else if (ch === '\t') {
        result += '\\t'
      }
      else {
        result += ch
      }
    }
    else {
      if (ch === '"') {
        inString = true
      }
      result += ch
    }
  }

  return result.replace(/,\s*([}\]])/g, '$1')
}

function tryParseStructuredJson(candidate: string): unknown | null {
  const attempts = [candidate, sanitizeLenientJson(candidate)]
  for (const text of attempts) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return { dialogue: parsed }
      }
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
    catch {
      // Try next lenient pass.
    }
  }
  return null
}

function extractDialogueObjectsFromBrokenJson(text: string): { title?: string, dialogue: { speaker: string, text: string }[] } | null {
  const titleMatch = text.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/)
  let title: string | undefined
  if (titleMatch) {
    try {
      title = JSON.parse(`"${titleMatch[1]}"`)
    }
    catch {
      title = titleMatch[1]
    }
  }

  const dialogue: { speaker: string, text: string }[] = []
  const pairRegex = /\{\s*"speaker"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g
  for (const match of text.matchAll(pairRegex)) {
    try {
      const speaker = JSON.parse(`"${match[1]}"`) as string
      const content = JSON.parse(`"${match[2]}"`) as string
      if (speaker && content) {
        dialogue.push({ speaker, text: content })
      }
    }
    catch {
      // Skip unparseable fragment.
    }
  }

  return dialogue.length > 0 ? { title, dialogue } : null
}

/**
 * Extracts JSON or converts speaker-prefixed dialogue text into JSON when an LLM
 * wraps its response in Markdown fences, adds prose, emits minor JSON glitches,
 * or outputs plain speaker-prefixed dialogue lines.
 */
export async function repairDialogueJson({ text }: { text: string }): Promise<string> {
  const trimmed = text.replace(/^\uFEFF/, '').trim()

  // 1. Check Markdown fenced blocks (including unclosed trailing fences).
  const fenceStart = trimmed.indexOf('```')
  if (fenceStart !== -1) {
    const afterStart = trimmed.slice(fenceStart + 3)
    const fenceEnd = afterStart.indexOf('```')
    let inner = (fenceEnd !== -1 ? afterStart.slice(0, fenceEnd) : afterStart).trim()
    if (/^json\b/i.test(inner)) {
      inner = inner.slice(4).trim()
    }
    const parsedInner = tryParseStructuredJson(inner)
    if (parsedInner) {
      return JSON.stringify(parsedInner)
    }
  }

  // 2. Check object or array slice within surrounding prose.
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1).trim()
    const parsedObj = tryParseStructuredJson(candidate)
    if (parsedObj) {
      return JSON.stringify(parsedObj)
    }
  }

  const firstBracket = trimmed.indexOf('[')
  const lastBracket = trimmed.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1).trim()
    const parsedArr = tryParseStructuredJson(candidate)
    if (parsedArr) {
      return JSON.stringify(parsedArr)
    }
  }

  // 3. Salvage speaker/text pairs from broken or truncated JSON before falling back to line splitting.
  if (trimmed.includes('"speaker"') && trimmed.includes('"text"')) {
    const salvaged = extractDialogueObjectsFromBrokenJson(sanitizeLenientJson(trimmed))
    if (salvaged) {
      return JSON.stringify(salvaged)
    }
  }

  // 4. Plain speaker-prefixed dialogue lines fallback (skip unrecognized metadata/header lines).
  const lines = trimmed.split('\n')
  const dialogue: { speaker: string, text: string }[] = []
  let title: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const colonIndex = line.search(/[：:]/)
    if (colonIndex > 0) {
      const prefix = line.slice(0, colonIndex).replace(/^[\s"'`「『【[(*#]+|[\s"'`」』】\])*#]+$/g, '').trim()
      const content = line.slice(colonIndex + 1).replace(/[*#]/g, '').trim()

      if (/^(?:標題|title)$/i.test(prefix) && content) {
        title = content.replace(/^["']|["'],?$/g, '').trim()
        continue
      }

      const normalizedSpeaker = normalizePodcastSpeaker(prefix)
      if (normalizedSpeaker && content) {
        dialogue.push({
          speaker: normalizedSpeaker,
          text: content,
        })
      }
    }
  }

  if (dialogue.length > 0) {
    return JSON.stringify({ title, dialogue })
  }
  return text
}

/**
 * Parses and validates LLM-generated script text into normalized Cordelia/David
 * dialogue chunks suitable for TTS synthesis.
 */
export async function parsePodcastScriptResponse(
  rawText: string,
  isEnglish = false,
): Promise<PodcastScriptResponse> {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    throw new Error('LLM returned an empty podcast script response')
  }

  let parsedJson: unknown = tryParseStructuredJson(trimmed)
  if (!parsedJson) {
    const repaired = await repairDialogueJson({ text: trimmed })
    parsedJson = tryParseStructuredJson(repaired)
    if (!parsedJson) {
      throw new Error(`Unable to parse podcast script JSON (len=${trimmed.length}, preview="${truncatePreview(trimmed)}")`)
    }
  }

  const validated = rawPodcastScriptSchema.parse(parsedJson)
  const maxChars = isEnglish ? 1000 : MAX_DIALOGUE_LINE_CHARS

  const sanitizedDialogue = validated.dialogue.flatMap((line, index) => {
    const rawSpeaker = line.speaker.trim()
    const text = line.text.trim()
    const speaker = normalizePodcastSpeaker(rawSpeaker)
    if (!speaker || !text) {
      throw new Error(`invalid dialogue line at index ${index} (speaker="${truncatePreview(rawSpeaker, 40)}", textLen=${text.length})`)
    }
    return splitDialogueText(text, maxChars).map(chunk => ({
      speaker,
      text: chunk,
    }))
  })

  if (sanitizedDialogue.length === 0) {
    throw new Error('parsed podcast script contains no valid dialogue lines')
  }

  const normalizedTitle = typeof validated.title === 'string' && validated.title.trim()
    ? validated.title.trim()
    : undefined

  return {
    title: normalizedTitle,
    dialogue: sanitizedDialogue,
  }
}
