#!/usr/bin/env node

import { randomUUID as nodeRandomUUID } from 'node:crypto'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

function readValue(args, index, option) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`)
  }
  return value
}

export function parseArguments(args) {
  const options = {
    phase: 'script',
    variant: 'hacker-news',
    force: false,
    idempotencyKey: undefined,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--force') {
      options.force = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--today') {
      options.today = readValue(args, index, argument)
      index += 1
      continue
    }
    if (argument === '--variant') {
      options.variant = readValue(args, index, argument)
      index += 1
      continue
    }
    if (argument === '--phase') {
      options.phase = readValue(args, index, argument)
      index += 1
      continue
    }
    if (argument === '--idempotency-key') {
      options.idempotencyKey = readValue(args, index, argument)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  if (!['script', 'audio'].includes(options.phase)) {
    throw new Error('--phase must be script or audio')
  }
  if (options.today && !/^\d{4}-\d{2}-\d{2}$/.test(options.today)) {
    throw new Error('--today must use YYYY-MM-DD')
  }

  return options
}

export function buildTriggerRequest({
  workerUrl,
  token,
  options,
  randomUUID = nodeRandomUUID,
}) {
  if (!workerUrl?.trim()) {
    throw new Error('PODCAST_WORKER_URL is required')
  }
  if (!token) {
    throw new Error('PODCAST_WORKFLOW_TOKEN is required')
  }

  const endpoint = new URL(workerUrl)
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !(isLocal && endpoint.protocol === 'http:')) {
    throw new Error('PODCAST_WORKER_URL must use HTTPS (HTTP is allowed only for localhost)')
  }

  endpoint.pathname = '/workflow'
  endpoint.search = ''
  endpoint.hash = ''

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const idempotencyKey = options.force
    ? options.idempotencyKey || randomUUID()
    : undefined
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  const body = {
    phase: options.phase,
    ...(options.today ? { today: options.today } : {}),
    variant: options.variant,
    force: options.force,
  }

  return {
    url: endpoint.toString(),
    idempotencyKey,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  }
}

function printHelp() {
  console.info(`Usage:
  pnpm workflow:run [--today YYYY-MM-DD] [--variant NAME] [--force]
  pnpm workflow:audio [--today YYYY-MM-DD] [--variant NAME]

Options:
  --today YYYY-MM-DD        Episode date (defaults to Taipei today)
  --variant NAME            Podcast variant (defaults to hacker-news)
  --force                   Intentionally create a new generation run
  --idempotency-key VALUE   Reuse a force request safely after a network error
  --phase script|audio      Workflow phase (normally set by the pnpm command)
  --help                    Show this help`)
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printHelp()
      return
    }

    const trigger = buildTriggerRequest({
      workerUrl: process.env.PODCAST_WORKER_URL,
      token: process.env.PODCAST_WORKFLOW_TOKEN,
      options,
    })

    console.info('Triggering podcast Workflow', {
      phase: options.phase,
      today: options.today || 'Taipei today',
      variant: options.variant,
      force: options.force,
      ...(trigger.idempotencyKey ? { idempotencyKey: trigger.idempotencyKey } : {}),
    })

    const response = await fetch(trigger.url, trigger.init)
    const responseText = await response.text()
    let responseBody
    try {
      responseBody = JSON.parse(responseText)
    }
    catch {
      responseBody = { message: responseText || response.statusText }
    }

    console.info(JSON.stringify(responseBody, null, 2))
    if (!response.ok) {
      process.exitCode = 1
    }
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entryUrl) {
  await main()
}
