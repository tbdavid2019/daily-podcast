import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const rootUrl = new URL('../', import.meta.url)

describe('build gate configuration', () => {
  it('provides one local command for lint, types, and focused tests', async () => {
    const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))

    assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit')
    assert.match(packageJson.scripts.check, /pnpm lint/)
    assert.match(packageJson.scripts.check, /pnpm typecheck/)
    assert.match(packageJson.scripts.check, /pnpm test:workflow/)
    assert.match(packageJson.scripts.check, /pnpm test:web-cache/)
    assert.match(packageJson.scripts.check, /pnpm test:pwa/)
    assert.match(packageJson.scripts.check, /pnpm test:build-gate/)
  })

  it('uses a Node version supported by Wrangler during clean installs', async () => {
    const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))
    const nodeVersion = (await readFile(new URL('.node-version', rootUrl), 'utf8')).trim()
    const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10)

    assert.ok(nodeMajor >= 22)
    assert.equal(packageJson.engines.node, '>=22')
    assert.doesNotMatch(packageJson.scripts.postinstall, /simple-git-hooks/)
    assert.match(packageJson.scripts.postinstall, /cf-typegen/)
    assert.match(packageJson.scripts['cf-typegen'], /normalize-generated-types/)
  })

  it('does not allow Next builds to ignore lint or TypeScript failures', async () => {
    const nextConfig = await readFile(new URL('next.config.mjs', rootUrl), 'utf8')

    assert.doesNotMatch(nextConfig, /ignoreBuildErrors\s*:\s*true/)
    assert.doesNotMatch(nextConfig, /ignoreDuringBuilds\s*:\s*true/)
  })

  it('runs the complete quality gate for pushes and pull requests', async () => {
    const workflow = await readFile(new URL('.github/workflows/quality-gate.yml', rootUrl), 'utf8')

    assert.match(workflow, /pull_request:/)
    assert.match(workflow, /push:/)
    assert.match(workflow, /pnpm install --frozen-lockfile/)
    assert.match(workflow, /pnpm lint/)
    assert.match(workflow, /pnpm typecheck/)
    assert.match(workflow, /pnpm test:workflow/)
    assert.match(workflow, /pnpm test:web-cache/)
    assert.match(workflow, /pnpm test:pwa/)
    assert.match(workflow, /pnpm test:build-gate/)
    assert.match(workflow, /pnpm opennext/)
    assert.match(workflow, /wrangler deploy --dry-run/)
    assert.match(workflow, /wrangler deploy --cwd worker --dry-run/)
  })
})
