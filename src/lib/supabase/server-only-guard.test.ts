import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * M0-07 acceptance: modules holding server secrets must be un-importable from
 * client components. The mechanism is the `server-only` package — importing a
 * module that imports it fails `next build` when reached from client code.
 *
 * This test pins the guard in place: if someone removes the import (or adds a
 * new secret-bearing module without one), CI fails with a message that names
 * the rule rather than silently shipping the service-role key to the browser.
 */
const GUARDED_MODULES = [
  'src/lib/supabase/service-client.ts',
  'src/lib/env/server.ts',
]

describe('server-only guard', () => {
  for (const modulePath of GUARDED_MODULES) {
    it(`${modulePath} imports 'server-only' as its first import`, () => {
      const source = readFileSync(join(process.cwd(), modulePath), 'utf8')

      expect(
        /^import 'server-only'/m.test(source),
        `${modulePath} holds server secrets and must start with ` +
          `"import 'server-only'" so client components cannot import it`,
      ).toBe(true)
    })
  }
})
