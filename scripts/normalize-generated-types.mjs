#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function normalizeTrailingWhitespace(source) {
  return source.replace(/[ \t]+$/gm, '')
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    throw new Error('Provide the generated file path')
  }

  const source = await readFile(filePath, 'utf8')
  const normalized = normalizeTrailingWhitespace(source)
  if (normalized !== source) {
    await writeFile(filePath, normalized, 'utf8')
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entryUrl) {
  await main()
}
