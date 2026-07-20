#!/usr/bin/env node

import { spawn } from 'node:child_process'
import process from 'node:process'

const token = process.env.PODCAST_WORKFLOW_TOKEN
if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
  console.error('PODCAST_WORKFLOW_TOKEN must be a 64-character hexadecimal Token')
  process.exitCode = 1
}
else {
  console.info('Storing API_SECRET_TOKEN in Cloudflare without printing its value')

  const child = spawn('pnpm', [
    'exec',
    'wrangler',
    'secret',
    'put',
    '--cwd',
    'worker',
    'API_SECRET_TOKEN',
  ], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  child.stdin.end(`${token}\n`)
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })

  if (exitCode !== 0) {
    process.exitCode = exitCode
  }
}
