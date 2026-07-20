#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { access, chmod, writeFile } from 'node:fs/promises'
import process from 'node:process'

const outputPath = '.env.workflow.local'

function parseArguments(args) {
  const options = { rotate: false }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--rotate') {
      options.rotate = true
      continue
    }
    if (argument === '--worker-url') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--worker-url requires a value')
      }
      options.workerUrl = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    const workerUrl = options.workerUrl || process.env.PODCAST_WORKER_URL
    if (!workerUrl) {
      throw new Error('Provide --worker-url or PODCAST_WORKER_URL')
    }

    const endpoint = new URL(workerUrl)
    if (endpoint.protocol !== 'https:') {
      throw new Error('The production Worker URL must use HTTPS')
    }

    if (await fileExists(outputPath) && !options.rotate) {
      throw new Error(`${outputPath} already exists; use --rotate to replace its Token`)
    }

    endpoint.pathname = ''
    endpoint.search = ''
    endpoint.hash = ''

    const token = randomBytes(32).toString('hex')
    const content = [
      '# Generated locally. This file is ignored by Git.',
      `PODCAST_WORKER_URL=${endpoint.toString().replace(/\/$/, '')}`,
      `PODCAST_WORKFLOW_TOKEN=${token}`,
      '',
    ].join('\n')

    await writeFile(outputPath, content, { encoding: 'utf8', mode: 0o600 })
    await chmod(outputPath, 0o600)

    console.info(`Created ${outputPath} with mode 0600 for ${endpoint.hostname}`)
    console.info('The Token value was not printed. Store the same value in Cloudflare with pnpm workflow:secret.')
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

await main()
