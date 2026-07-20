import assert from 'node:assert/strict'
import { it } from 'node:test'
import { normalizeTrailingWhitespace } from '../scripts/normalize-generated-types.mjs'

it('removes generated trailing spaces without changing indentation', () => {
  const generated = 'interface Env {\n\tKEY: string;  \n}\n'

  assert.equal(
    normalizeTrailingWhitespace(generated),
    'interface Env {\n\tKEY: string;\n}\n',
  )
})
