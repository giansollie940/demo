import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { CATALOG, CATALOG_VERSION } from '../../src/features/auth-bag/catalog'
import { checkPolicy, MAX_ITEMS, MIN_ITEMS, randomSequence, SAMPLE_SEQUENCE, toVerifierInput } from '../../src/features/auth-bag/sequence'
import { bagLoginEnabled } from '../../src/features/auth-bag/flag'
import * as server from '../../supabase/functions/_shared/bag-catalog'

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
const base = ['crayon_red', 'notebook_blue', 'crayon_red', 'ruler_yellow', 'eraser_green', 'crayon_blue', 'sharpener_red', 'notebook_green', 'pencil_yellow', 'ruler_blue']

describe('server catalogue matches the browser one', () => {
  test('same version, size and length limits', () => {
    expect(server.CATALOG_VERSION).toBe(CATALOG_VERSION)
    expect(server.CATALOG_SIZE).toBe(CATALOG.length)
    expect([server.MIN_ITEMS, server.MAX_ITEMS]).toEqual([MIN_ITEMS, MAX_ITEMS])
  })

  test('every item encodes to the same verifier byte', () => {
    for (const item of CATALOG) {
      const sequence = Array.from({ length: MIN_ITEMS }, (_, i) => (i === 0 ? item.id : base[i]!))
      expect(server.toInputHex({ version: 1, items: sequence })).toBe(hex(toVerifierInput(sequence)))
    }
  })

  test('the verifier input for a known sequence', () => {
    const s = ['crayon_red', 'notebook_blue', 'crayon_red', 'ruler_yellow', 'eraser_green', 'crayon_blue', 'sharpener_red', 'scissors_green', 'pen_yellow', 'pencilcase_blue', 'ruler_blue', 'pencil_green']
    expect(server.toInputHex({ version: 1, items: s })).toBe('011005100a0f1114231a1d0903')
  })

  test('malformed payloads are rejected', () => {
    expect(server.toInputHex({ version: 2, items: base })).toBeNull()
    expect(server.toInputHex({ version: '1', items: base })).toBeNull()
    expect(server.toInputHex({ version: 1, items: base.slice(0, 9) })).toBeNull()
    expect(server.toInputHex({ version: 1, items: [...base, ...base, 'pen_red'] })).toBeNull()
    expect(server.toInputHex({ version: 1, items: [...base.slice(0, 9), 'laptop_red'] })).toBeNull()
    expect(server.toInputHex({ version: 1, items: [...base.slice(0, 9), 7] })).toBeNull()
    expect(server.toInputHex({ version: 1, items: 'pencil_red' })).toBeNull()
    expect(server.toInputHex(null as never)).toBeNull()
  })

  test('policy agrees with the browser check', () => {
    const cases = [
      base,
      Array(12).fill('pen_red'),
      Array.from({ length: 12 }, (_, i) => (i % 2 ? 'pen_red' : 'ruler_blue')),
      Array.from({ length: 12 }, (_, i) => ['pen_red', 'ruler_blue', 'eraser_green'][i % 3]!),
      [...SAMPLE_SEQUENCE, ...base.slice(0, 8)],
      ...Array.from({ length: 50 }, () => randomSequence(12)),
    ]
    for (const items of cases) expect(server.policyIssue(items) === null).toBe(checkPolicy(items) === null)
  })
})

describe('database upgrade 18', () => {
  const sql = readFileSync(new URL('../../database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql', import.meta.url), 'utf8')

  test('runs in one transaction', () => {
    expect(sql.trimStart().split('\n').find(line => !line.startsWith('--'))).toBe('begin;')
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
  })

  test('the credential store is private and only service_role may call the API', () => {
    expect(sql).toMatch(/revoke all on schema auth_bag from public, anon, authenticated;/)
    expect(sql).not.toMatch(/grant[^;]*to (anon|authenticated|public)/i)
    const apis = [...sql.matchAll(/create or replace function (public\.bag_auth_\w+)\(/g)].map(m => m[1])
    expect(apis).toEqual(['public.bag_auth_status', 'public.bag_auth_enroll', 'public.bag_auth_disable', 'public.bag_auth_attempt', 'public.bag_auth_still_valid'])
    for (const name of apis) {
      expect(sql).toMatch(new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated;`))
      expect(sql).toMatch(new RegExp(`grant execute on function ${name.replace('.', '\\.')}\\([^)]*\\) to service_role;`))
    }
  })

  test('every function pins an empty search_path', () => {
    const headers = [...sql.matchAll(/create or replace function [\s\S]*?as \$\$/g)].map(m => m[0])
    expect(headers.length).toBeGreaterThanOrEqual(10)
    for (const header of headers) expect(header).toContain("set search_path = ''")
  })

  test('stores only a salted bcrypt verifier, never the sequence', () => {
    expect(sql).toContain("extensions.crypt(encode(v_input, 'hex'), extensions.gen_salt('bf', 10))")
    expect(sql).not.toMatch(/\b(items|sequence|plaintext)\s+(text|jsonb|bytea)/i)
  })
})

describe('rollout flag', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  test('off unless config.js says authBag: true', () => {
    vi.stubGlobal('window', {})
    expect(bagLoginEnabled()).toBe(false)
    vi.stubGlobal('window', { APP_CONFIG: { authBag: 'true' } })
    expect(bagLoginEnabled()).toBe(false)
    vi.stubGlobal('window', { APP_CONFIG: { authBag: true } })
    expect(bagLoginEnabled()).toBe(true)
  })
})
