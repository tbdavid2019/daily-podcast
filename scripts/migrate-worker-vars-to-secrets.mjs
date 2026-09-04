#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const configPath = 'worker/wrangler.jsonc'
const sensitiveKeys = new Map([
  ['GEMINI_TTS_API_KEY', 'GEMINI_TTS_API_SECRET'],
  ['GEMINI_TTS_FALLBACK_API_KEY', 'GEMINI_TTS_FALLBACK_API_SECRET'],
  ['OPENAI_API_KEY', 'OPENAI_API_SECRET'],
  ['OPENAI_TTS_API_KEY', 'OPENAI_TTS_API_SECRET'],
  ['TTS_API_KEY', 'TTS_API_SECRET'],
])

function findConfigValue(config, key) {
  const pattern = new RegExp(`^\\s*"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")\\s*,?\\s*$`, 'm')
  const match = config.match(pattern)
  if (!match) {
    return undefined
  }
  return {
    pattern,
    value: JSON.parse(match[1]),
  }
}

async function putSecret(sourceKey, secretKey, value) {
  console.info(`Migrating ${sourceKey} to Cloudflare secret ${secretKey}`)
  const child = spawn('pnpm', [
    'exec',
    'wrangler',
    'secret',
    'put',
    '--cwd',
    'worker',
    secretKey,
  ], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  child.stdin.end(`${value}\n`)
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })

  if (exitCode !== 0) {
    throw new Error(`Failed to migrate ${sourceKey}`)
  }
}

let config = await readFile(configPath, 'utf8')
const migratedKeys = []

for (const [sourceKey, secretKey] of sensitiveKeys) {
  const entry = findConfigValue(config, sourceKey)
  if (!entry) {
    continue
  }

  await putSecret(sourceKey, secretKey, entry.value)
  config = config.replace(entry.pattern, '')
  migratedKeys.push(sourceKey)
}

if (migratedKeys.length) {
  config = config.replace(/"keep_vars"\s*:\s*true/, '"keep_vars": false')
  await writeFile(configPath, config, 'utf8')
  console.info(`Removed migrated values from ${configPath}: ${migratedKeys.join(', ')}`)
}
else {
  console.info(`No plaintext API keys found in ${configPath}`)
}
