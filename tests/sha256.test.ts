import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256 } from '../src/lib/sha256.ts'

describe('sha256', () => {
  it.each(['', 'abc', 'upinternacional', 'ção ünïcode €', 'x'.repeat(1000)])('igual ao node: %s', (t) => {
    expect(sha256(t)).toBe(createHash('sha256').update(t).digest('hex'))
  })
})
