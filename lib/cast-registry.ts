export type CanonicalPodcastSpeakerId = '女' | '男'
export type PodcastSpeakerId = CanonicalPodcastSpeakerId | (string & {})

export type SpeakerBadgeTone = 'rose' | 'sky' | 'amber' | 'emerald'

export interface PodcastSpeakerProfile<TSpeaker extends string = string> {
  id: TSpeaker
  name: string
  englishName?: string
  aliases: readonly string[]
  voiceRole?: 'female' | 'male' | 'custom'
  geminiVoiceEnvKey?: string
  defaultGeminiVoice?: string
  defaultOpenAIVoice?: string
  badgeTone?: SpeakerBadgeTone
  voiceId?: string
}

export interface SpeakerVoiceEnv {
  MAN_VOICE_ID?: string
  WOMAN_VOICE_ID?: string
}

export interface SpeakerVoiceConfig {
  geminiVoice: string
  openaiVoice: string
  role: 'female' | 'male' | 'custom'
}

export const DEFAULT_CAST_REGISTRY: readonly PodcastSpeakerProfile<CanonicalPodcastSpeakerId>[] = [
  {
    id: '女',
    name: 'Cordelia',
    englishName: 'Cordelia',
    aliases: ['女', 'cordelia', '女聲', '女性', '女主持人', 'female', 'woman'],
    voiceRole: 'female',
    geminiVoiceEnvKey: 'WOMAN_VOICE_ID',
    defaultGeminiVoice: 'Leda',
    defaultOpenAIVoice: 'nova',
    badgeTone: 'rose',
  },
  {
    id: '男',
    name: 'David',
    englishName: 'David',
    aliases: ['男', 'david', '男聲', '男性', '男主持人', 'male', 'man'],
    voiceRole: 'male',
    geminiVoiceEnvKey: 'MAN_VOICE_ID',
    defaultGeminiVoice: 'Sadaltager',
    defaultOpenAIVoice: 'onyx',
    badgeTone: 'sky',
  },
]

const BADGE_TONE_CLASSES: Record<SpeakerBadgeTone, string> = {
  rose: 'bg-rose-50 text-rose-700 border border-rose-200/80',
  sky: 'bg-sky-50 text-sky-700 border border-sky-200/80',
  amber: 'bg-amber-50 text-amber-800 border border-amber-200/80',
  emerald: 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
}

export function cleanSpeakerLabel(rawSpeaker: string): string {
  return rawSpeaker
    .replace(/^[\s"'`「『【[(*#]+|[\s"'`」』】\])*#]+$/g, '')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesAliasToken(cleaned: string, lower: string, token: string): boolean {
  const normalizedToken = token.trim().toLowerCase()
  if (!normalizedToken) {
    return false
  }
  // ASCII-only tokens (e.g. "man", "male") must match at non-alphanumeric boundaries
  // so names like "Herman" or labels like "female" never cross-match.
  if (/^[\w\s.-]+$/.test(normalizedToken)) {
    const boundaryPattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedToken)}(?:$|[^a-z0-9])`, 'i')
    return boundaryPattern.test(lower)
  }
  return cleaned.includes(token) || lower.includes(normalizedToken)
}

function findCastProfile<TSpeaker extends string>(
  rawSpeaker: string,
  cast: readonly PodcastSpeakerProfile<TSpeaker>[],
): PodcastSpeakerProfile<TSpeaker> | null {
  const cleaned = cleanSpeakerLabel(rawSpeaker)
  if (!cleaned) {
    return null
  }

  const lower = cleaned.toLowerCase()

  // 1. Exact ID / name / englishName / alias match (highest priority, unambiguous for N speakers).
  for (const profile of cast) {
    if (
      cleaned === profile.id
      || lower === profile.id.toLowerCase()
      || lower === profile.name.toLowerCase()
      || (profile.englishName && lower === profile.englishName.toLowerCase())
      || profile.aliases.some(alias => lower === alias.toLowerCase())
    ) {
      return profile
    }
  }

  // 2. Boundary-aware composite token match (e.g. "Cordelia（女）", "來賓 Alex", "David／男")
  // only when it uniquely matches exactly one cast member.
  const matchedProfiles = cast.filter((profile) => {
    const tokens = [profile.id, profile.name, profile.englishName ?? '', ...profile.aliases]
      .map(token => token.trim())
      .filter(Boolean)
    return tokens.some(token => matchesAliasToken(cleaned, lower, token))
  })
  if (matchedProfiles.length === 1) {
    return matchedProfiles[0]
  }

  return null
}

/**
 * Resolves a raw speaker label against a configured speaker cast.
 * Supports exact aliases, parenthetical combinations like "Cordelia（女）" or "David／男",
 * and optional dynamic guest speakers when allowDynamicSpeakers is enabled.
 */
export function resolveCastSpeaker<TSpeaker extends string = PodcastSpeakerId>(
  rawSpeaker: string,
  cast: readonly PodcastSpeakerProfile<TSpeaker>[] = DEFAULT_CAST_REGISTRY as readonly PodcastSpeakerProfile<TSpeaker>[],
  allowDynamicSpeakers = false,
): TSpeaker | null {
  const cleaned = cleanSpeakerLabel(rawSpeaker)
  if (!cleaned) {
    return null
  }

  const matched = findCastProfile(cleaned, cast)
  if (matched) {
    return matched.id
  }

  if (allowDynamicSpeakers) {
    return cleaned as TSpeaker
  }

  return null
}

export function formatSpeakerDisplayName(
  speaker: string,
  isEnglish: boolean,
  cast: readonly PodcastSpeakerProfile[] = DEFAULT_CAST_REGISTRY,
): string {
  const matched = findCastProfile(speaker, cast)
  if (!matched) {
    return speaker.trim()
  }

  return isEnglish ? (matched.englishName || matched.name) : matched.id
}

function readEnvOverride(env: SpeakerVoiceEnv, key?: string): string {
  if (!key) {
    return ''
  }
  const value = (env as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function getSpeakerVoiceConfig(
  speaker: string,
  env: SpeakerVoiceEnv = {},
  cast: readonly PodcastSpeakerProfile[] = DEFAULT_CAST_REGISTRY,
): SpeakerVoiceConfig {
  const matched = findCastProfile(speaker, cast)
  const role: 'female' | 'male' | 'custom' = matched?.voiceRole
    ?? (speaker === '男' ? 'male' : speaker === '女' ? 'female' : 'custom')

  const roleEnvKey = role === 'male' ? 'MAN_VOICE_ID' : role === 'female' ? 'WOMAN_VOICE_ID' : undefined
  const envVoice = readEnvOverride(env, matched?.geminiVoiceEnvKey) || readEnvOverride(env, roleEnvKey)

  const defaultGeminiVoice = matched?.defaultGeminiVoice
    || matched?.voiceId
    || (role === 'male' ? 'Sadaltager' : role === 'female' ? 'Leda' : 'Puck')
  const defaultOpenAIVoice = matched?.defaultOpenAIVoice
    || (role === 'male' ? 'onyx' : role === 'female' ? 'nova' : 'alloy')

  return {
    geminiVoice: envVoice || defaultGeminiVoice,
    openaiVoice: (role !== 'custom' ? readEnvOverride(env, roleEnvKey) : '') || defaultOpenAIVoice,
    role,
  }
}

export function getSpeakerBadgeClass(
  speaker: string,
  cast: readonly PodcastSpeakerProfile[] = DEFAULT_CAST_REGISTRY,
): string {
  const matched = findCastProfile(speaker, cast)
  if (matched) {
    if (matched.badgeTone) {
      return BADGE_TONE_CLASSES[matched.badgeTone]
    }
    if (matched.voiceRole === 'female') {
      return BADGE_TONE_CLASSES.rose
    }
    if (matched.voiceRole === 'male') {
      return BADGE_TONE_CLASSES.sky
    }
  }

  const normalized = speaker.trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash + normalized.charCodeAt(i)) | 0
  }
  const guestTone: SpeakerBadgeTone = Math.abs(hash) % 2 === 0 ? 'amber' : 'emerald'
  return BADGE_TONE_CLASSES[guestTone]
}
