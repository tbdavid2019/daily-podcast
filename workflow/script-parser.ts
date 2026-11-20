import type { PodcastDialogueLine, PodcastScriptResponse } from './types'
import { z } from 'zod'
import { MAX_DIALOGUE_LINE_CHARS, splitDialogueText } from './efficiency'

export type ScriptParseFormat = 'xml' | 'json' | 'lines'

/**
 * Extensible speaker definition for N-host / guest podcast casts.
 * Future multi-host or guest episodes can extend DEFAULT_PODCAST_CAST with
 * additional profiles (e.g. { id: '來賓', name: 'Alex', aliases: ['來賓', 'guest', 'alex'], voiceRole: 'custom' }).
 */
export interface PodcastSpeakerProfile<TSpeaker extends string = string> {
  id: TSpeaker
  name: string
  aliases: readonly string[]
  voiceRole?: 'female' | 'male' | 'custom'
  voiceId?: string
}

export const DEFAULT_PODCAST_CAST: readonly PodcastSpeakerProfile<PodcastDialogueLine['speaker']>[] = [
  {
    id: '女',
    name: 'Cordelia',
    aliases: ['女', 'cordelia', '女聲', '女性', '女主持人', 'female', 'woman'],
    voiceRole: 'female',
  },
  {
    id: '男',
    name: 'David',
    aliases: ['男', 'david', '男聲', '男性', '男主持人', 'male', 'man'],
    voiceRole: 'male',
  },
]

export interface ParsePodcastScriptOptions<TSpeaker extends string = PodcastDialogueLine['speaker']> {
  isEnglish?: boolean
  cast?: readonly PodcastSpeakerProfile<TSpeaker>[]
  allowDynamicSpeakers?: boolean
  minTurns?: number
  requireMultipleSpeakers?: boolean
}

export interface ParsedPodcastScript<TSpeaker extends string = PodcastDialogueLine['speaker']> {
  title?: string
  intro?: string
  dialogue: { speaker: TSpeaker, text: string }[]
  format: ScriptParseFormat
  speakers: TSpeaker[]
}

const rawDialogueItemSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
})

const rawPodcastScriptSchema = z.object({
  title: z.string().nullable().optional(),
  intro: z.string().nullable().optional(),
  dialogue: z.array(rawDialogueItemSchema).min(1),
})

function truncatePreview(value: string, maxLength = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`
}

function cleanSpeakerLabel(rawSpeaker: string): string {
  return rawSpeaker
    .replace(/^[\s"'`「『【[(*#]+|[\s"'`」』】\])*#]+$/g, '')
    .trim()
}

/**
 * Resolves a raw speaker label against a configured speaker cast.
 * Supports exact aliases, parenthetical combinations like "Cordelia（女）" or "David／男",
 * and optional dynamic guest speakers when allowDynamicSpeakers is enabled.
 */
export function resolvePodcastSpeaker<TSpeaker extends string = PodcastDialogueLine['speaker']>(
  rawSpeaker: string,
  cast: readonly PodcastSpeakerProfile<TSpeaker>[] = DEFAULT_PODCAST_CAST as readonly PodcastSpeakerProfile<TSpeaker>[],
  allowDynamicSpeakers = false,
): TSpeaker | null {
  const cleaned = cleanSpeakerLabel(rawSpeaker)
  if (!cleaned) {
    return null
  }

  const lower = cleaned.toLowerCase()

  // 1. Exact ID / name / alias match (highest priority, unambiguous for N speakers).
  for (const profile of cast) {
    if (
      cleaned === profile.id
      || lower === profile.id.toLowerCase()
      || lower === profile.name.toLowerCase()
      || profile.aliases.some(alias => lower === alias.toLowerCase())
    ) {
      return profile.id
    }
  }

  // 2. Substring/composite token match (e.g. "Cordelia（女）", "來賓 Alex", "David／男")
  // only when it uniquely matches exactly one cast member.
  const matchedProfiles = cast.filter((profile) => {
    const tokens = [profile.id, profile.name, ...profile.aliases]
      .map(token => token.trim().toLowerCase())
      .filter(Boolean)
    return tokens.some(token => lower.includes(token))
  })
  if (matchedProfiles.length === 1) {
    return matchedProfiles[0].id
  }

  if (allowDynamicSpeakers) {
    return cleaned as TSpeaker
  }

  return null
}

/**
 * Convenience wrapper for the canonical 2-host ('女' | '男') cast.
 */
export function normalizePodcastSpeaker(rawSpeaker: string): PodcastDialogueLine['speaker'] | null {
  return resolvePodcastSpeaker(rawSpeaker, DEFAULT_PODCAST_CAST, false)
}

function decodeBasicXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

function stripOuterMarkdownFence(input: string): string {
  const trimmed = input.replace(/^\uFEFF/, '').trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }
  const firstNewline = trimmed.indexOf('\n')
  if (firstNewline === -1) {
    return trimmed
  }
  const afterHeader = trimmed.slice(firstNewline + 1)
  const closingFence = afterHeader.lastIndexOf('```')
  return (closingFence !== -1 ? afterHeader.slice(0, closingFence) : afterHeader).trim()
}

/**
 * Parses the XML-tag podcast script protocol:
 *   <title>...</title>
 *   <turn speaker="女">...</turn>
 *   <turn speaker="男">...</turn>
 *   <turn speaker="來賓">...</turn>
 *
 * Quotes, colons, code snippets, and newlines inside <turn> bodies do not break parsing.
 */
export function parseXmlPodcastScript(rawText: string): { title?: string, intro?: string, dialogue: { speaker: string, text: string }[] } | null {
  const cleaned = stripOuterMarkdownFence(rawText)
  if (!/<turn\b/i.test(cleaned)) {
    return null
  }

  let title: string | undefined
  const titleMatch = cleaned.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    const candidate = decodeBasicXmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
    if (candidate) {
      title = candidate
    }
  }

  let intro: string | undefined
  const introMatch = cleaned.match(/<intro\b[^>]*>([\s\S]*?)<\/intro>/i)
  if (introMatch) {
    const candidate = decodeBasicXmlEntities(introMatch[1]).replace(/\s+/g, ' ').trim()
    if (candidate) {
      intro = candidate
    }
  }

  const dialogue: { speaker: string, text: string }[] = []
  const turnRegex = /<turn\b([^>]*)>([\s\S]*?)(?:<\/turn>|(?=<turn\b)|$)/gi

  for (const match of cleaned.matchAll(turnRegex)) {
    const attrs = match[1] || ''
    const bodyRaw = match[2] || ''
    const speakerAttr = attrs.match(/\bspeaker\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i)
    const speaker = (speakerAttr?.[1] || speakerAttr?.[2] || speakerAttr?.[3] || '').trim()
    const body = decodeBasicXmlEntities(bodyRaw)
      .replace(/<\/podcast-script>\s*$/i, '')
      .trim()

    if (speaker && body) {
      dialogue.push({ speaker, text: body })
    }
  }

  return dialogue.length > 0 ? { title, intro, dialogue } : null
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

function extractPlainDialogueLines<TSpeaker extends string>(
  text: string,
  cast: readonly PodcastSpeakerProfile<TSpeaker>[],
  allowDynamicSpeakers: boolean,
): { title?: string, dialogue: { speaker: string, text: string }[] } | null {
  const lines = text.split('\n')
  const dialogue: { speaker: string, text: string }[] = []
  let title: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const colonIndex = line.search(/[：:]/)
    if (colonIndex > 0) {
      const prefix = cleanSpeakerLabel(line.slice(0, colonIndex))
      const content = line.slice(colonIndex + 1).replace(/[*#]/g, '').trim()

      if (/^(?:標題|title)$/i.test(prefix) && content) {
        title = content.replace(/^["']|["'],?$/g, '').trim()
        continue
      }

      const resolved = resolvePodcastSpeaker(prefix, cast, allowDynamicSpeakers)
      if (resolved && content) {
        dialogue.push({
          speaker: resolved,
          text: content,
        })
      }
    }
  }

  return dialogue.length > 0 ? { title, dialogue } : null
}

/**
 * Converts XML, fenced JSON, broken JSON, or speaker-prefixed plain text into normalized JSON.
 */
export async function repairDialogueJson({
  text,
  cast = DEFAULT_PODCAST_CAST,
  allowDynamicSpeakers = false,
}: {
  text: string
  cast?: readonly PodcastSpeakerProfile[]
  allowDynamicSpeakers?: boolean
}): Promise<string> {
  const trimmed = text.replace(/^\uFEFF/, '').trim()

  const xmlParsed = parseXmlPodcastScript(trimmed)
  if (xmlParsed) {
    return JSON.stringify(xmlParsed)
  }

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

  if (trimmed.includes('"speaker"') && trimmed.includes('"text"')) {
    const salvaged = extractDialogueObjectsFromBrokenJson(sanitizeLenientJson(trimmed))
    if (salvaged) {
      return JSON.stringify(salvaged)
    }
  }

  const plainParsed = extractPlainDialogueLines(trimmed, cast, allowDynamicSpeakers)
  if (plainParsed) {
    return JSON.stringify(plainParsed)
  }

  return text
}

/**
 * Parses and validates LLM-generated script text (XML <turn> protocol preferred,
 * with automatic JSON and speaker-line compatibility) into normalized dialogue chunks.
 */
export async function parsePodcastScriptResponse<TSpeaker extends string = PodcastDialogueLine['speaker']>(
  rawText: string,
  optionsOrIsEnglish: boolean | ParsePodcastScriptOptions<TSpeaker> = false,
): Promise<ParsedPodcastScript<TSpeaker>> {
  const options: ParsePodcastScriptOptions<TSpeaker> = typeof optionsOrIsEnglish === 'boolean'
    ? { isEnglish: optionsOrIsEnglish }
    : optionsOrIsEnglish

  const isEnglish = Boolean(options.isEnglish)
  const cast = (options.cast ?? DEFAULT_PODCAST_CAST) as readonly PodcastSpeakerProfile<TSpeaker>[]
  const allowDynamicSpeakers = Boolean(options.allowDynamicSpeakers)
  const minTurns = options.minTurns ?? 1
  const requireMultipleSpeakers = Boolean(options.requireMultipleSpeakers)

  const trimmed = rawText.replace(/^\uFEFF/, '').trim()
  if (!trimmed) {
    throw new Error('LLM returned an empty podcast script response')
  }

  let format: ScriptParseFormat = 'xml'
  let parsedRaw: unknown = parseXmlPodcastScript(trimmed)

  if (!parsedRaw) {
    format = 'json'
    parsedRaw = tryParseStructuredJson(trimmed)
  }

  if (!parsedRaw) {
    const fenceStart = trimmed.indexOf('```')
    if (fenceStart !== -1) {
      const afterStart = trimmed.slice(fenceStart + 3)
      const fenceEnd = afterStart.indexOf('```')
      let inner = (fenceEnd !== -1 ? afterStart.slice(0, fenceEnd) : afterStart).trim()
      if (/^json\b/i.test(inner)) {
        inner = inner.slice(4).trim()
      }
      parsedRaw = tryParseStructuredJson(inner)
    }
  }

  if (!parsedRaw) {
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsedRaw = tryParseStructuredJson(trimmed.slice(firstBrace, lastBrace + 1).trim())
    }
  }

  if (!parsedRaw) {
    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      parsedRaw = tryParseStructuredJson(trimmed.slice(firstBracket, lastBracket + 1).trim())
    }
  }

  if (!parsedRaw && trimmed.includes('"speaker"') && trimmed.includes('"text"')) {
    parsedRaw = extractDialogueObjectsFromBrokenJson(sanitizeLenientJson(trimmed))
  }

  if (!parsedRaw) {
    format = 'lines'
    parsedRaw = extractPlainDialogueLines(trimmed, cast, allowDynamicSpeakers)
  }

  if (!parsedRaw) {
    throw new Error(`Unable to parse podcast script (len=${trimmed.length}, preview="${truncatePreview(trimmed)}")`)
  }

  const validated = rawPodcastScriptSchema.parse(parsedRaw)
  const maxChars = isEnglish ? 1000 : MAX_DIALOGUE_LINE_CHARS

  const distinctSpeakers = new Set<TSpeaker>()
  const sanitizedDialogue = validated.dialogue.flatMap((line, index) => {
    const rawSpeaker = line.speaker.trim()
    const text = line.text.trim()
    const speaker = resolvePodcastSpeaker(rawSpeaker, cast, allowDynamicSpeakers)
    if (!speaker || !text) {
      throw new Error(`invalid dialogue line at index ${index} (speaker="${truncatePreview(rawSpeaker, 40)}", textLen=${text.length})`)
    }
    distinctSpeakers.add(speaker)
    return splitDialogueText(text, maxChars).map(chunk => ({
      speaker,
      text: chunk,
    }))
  })

  if (sanitizedDialogue.length < minTurns) {
    throw new Error(`parsed podcast script too short (${sanitizedDialogue.length} turns, minimum ${minTurns})`)
  }

  if (requireMultipleSpeakers && cast.length >= 2 && distinctSpeakers.size < 2) {
    throw new Error(`parsed podcast script contains only ${distinctSpeakers.size} distinct speaker(s); expected at least 2`)
  }

  const normalizedTitle = typeof validated.title === 'string' && validated.title.trim()
    ? validated.title.trim()
    : undefined
  const normalizedIntro = typeof validated.intro === 'string' && validated.intro.trim()
    ? validated.intro.trim()
    : undefined

  return {
    title: normalizedTitle,
    ...(normalizedIntro ? { intro: normalizedIntro } : {}),
    dialogue: sanitizedDialogue,
    format,
    speakers: [...distinctSpeakers],
  }
}

export type CanonicalPodcastScript = PodcastScriptResponse

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseTaggedStoryBlocks(text: string, tagName: string, expectedTitles: readonly string[]): string[] {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error(`extract ${tagName} returned empty output`)
  }

  const escapedTag = escapeRegExp(tagName)
  const blocks: string[] = []
  const closedRegex = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'gi')
  let lastMatchedEnd = 0
  for (const match of trimmed.matchAll(closedRegex)) {
    const content = (match[1] ?? '').trim()
    if (content) {
      blocks.push(content)
    }
    lastMatchedEnd = (match.index ?? 0) + match[0].length
  }

  const trailingRemainder = trimmed.slice(lastMatchedEnd)
  const unclosedMatch = trailingRemainder.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]+)$`, 'i'))
  if (unclosedMatch) {
    const trailingContent = (unclosedMatch[1] ?? '').replace(new RegExp(`<\\/${escapedTag}>[\\s\\S]*$`, 'i'), '').trim()
    if (trailingContent) {
      blocks.push(trailingContent)
    }
  }

  if (blocks.length > 0) {
    return blocks
  }

  // Fallback: split around occurrences of expected story titles in document order
  if (expectedTitles.length > 0) {
    const positions = expectedTitles
      .map(title => title.trim())
      .filter(Boolean)
      .map(title => trimmed.indexOf(title))
      .filter(pos => pos >= 0)
      .sort((a, b) => a - b)

    if (positions.length >= 2) {
      const uniquePositions = [...new Set(positions)]
      const byTitle = uniquePositions
        .map((start, idx) => {
          const end = idx + 1 < uniquePositions.length ? uniquePositions[idx + 1] : trimmed.length
          return trimmed.slice(start, end).trim()
        })
        .filter(Boolean)
      if (byTitle.length > 0) {
        return byTitle
      }
    }
  }

  const headingSections = trimmed
    .split(/\n(?=#{1,4}\s)/)
    .map(section => section.trim())
    .filter(section => section.length > 0)
  if (headingSections.length >= 2) {
    return headingSections
  }

  const ruleSections = trimmed
    .split(/\n\s*-{3,}\s*\n/)
    .map(section => section.trim())
    .filter(section => section.length > 0)
  if (ruleSections.length >= 2) {
    return ruleSections
  }

  return [trimmed]
}

/**
 * Extracts individual story summary blocks from batch summarization output.
 */
export function parseStorySummaries(text: string, expectedTitles: readonly string[]): string[] {
  return parseTaggedStoryBlocks(text, 'story-summary', expectedTitles)
}

/**
 * Extracts language-neutral Evidence Dossier blocks from batch extraction output.
 */
export function parseStoryDossiers(text: string, expectedTitles: readonly string[]): string[] {
  return parseTaggedStoryBlocks(text, 'story-dossier', expectedTitles)
}
