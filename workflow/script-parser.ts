import type { PodcastDialogueLine, PodcastScriptResponse } from './types'
import { z } from 'zod'
import { MAX_DIALOGUE_LINE_CHARS, splitDialogueText } from './efficiency'

const rawPodcastScriptSchema = z.object({
  title: z.string().nullable().optional(),
  dialogue: z.array(z.object({
    speaker: z.string().min(1),
    text: z.string().min(1),
  })).min(1),
})

/**
 * Extracts JSON or converts speaker-prefixed dialogue text into JSON when an LLM
 * wraps its response in Markdown fences or plain dialogue lines.
 */
export async function repairDialogueJson({ text }: { text: string }): Promise<string> {
  const trimmed = text.trim()
  const codeBlockStart = trimmed.indexOf('```')
  if (codeBlockStart !== -1) {
    const codeBlockEnd = trimmed.indexOf('```', codeBlockStart + 3)
    if (codeBlockEnd !== -1) {
      let inner = trimmed.slice(codeBlockStart + 3, codeBlockEnd).trim()
      if (inner.startsWith('json')) {
        inner = inner.slice(4).trim()
      }
      if (inner.startsWith('{')) {
        return inner
      }
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1).trim()
    try {
      JSON.parse(candidate)
      return candidate
    }
    catch {
      // Fall through to line-by-line speaker extraction.
    }
  }

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
      const prefix = line.slice(0, colonIndex).replace(/[*#]/g, '').trim()
      const content = line.slice(colonIndex + 1).replace(/[*#]/g, '').trim()

      if (/^(?:標題|title)$/i.test(prefix)) {
        title = content
      }
      else if (prefix && content) {
        dialogue.push({
          speaker: prefix,
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
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('LLM returned an empty podcast script response')
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(trimmed)
  }
  catch {
    const repaired = await repairDialogueJson({ text: trimmed })
    parsedJson = JSON.parse(repaired)
  }

  const validated = rawPodcastScriptSchema.parse(parsedJson)
  const maxChars = isEnglish ? 1000 : MAX_DIALOGUE_LINE_CHARS

  const sanitizedDialogue = validated.dialogue.flatMap((line, index) => {
    const rawSpeaker = line.speaker.trim()
    const text = line.text.trim()
    const speaker = rawSpeaker === '女' || rawSpeaker.toLowerCase() === 'cordelia'
      ? '女'
      : rawSpeaker === '男' || rawSpeaker.toLowerCase() === 'david'
        ? '男'
        : null
    if (!speaker || !text) {
      throw new Error(`invalid dialogue line at index ${index}`)
    }
    return splitDialogueText(text, maxChars).map(chunk => ({
      speaker: speaker as PodcastDialogueLine['speaker'],
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
