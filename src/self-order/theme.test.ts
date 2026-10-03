import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applySelfOrderTheme,
  normalizeSelfOrderBrand,
  resolveSelfOrderTheme,
} from './theme.ts'

describe('self-order theme', () => {
  it('falls back to classic for unknown brands', () => {
    expect(normalizeSelfOrderBrand('ocean')).toBe('ocean')
    expect(normalizeSelfOrderBrand('custom')).toBe('custom')
    expect(normalizeSelfOrderBrand('bogus')).toBe('classic')
    expect(normalizeSelfOrderBrand(undefined)).toBe('classic')
  })

  it('resolves light / dark / system', () => {
    expect(resolveSelfOrderTheme('light', true)).toBe('light')
    expect(resolveSelfOrderTheme('dark', false)).toBe('dark')
    expect(resolveSelfOrderTheme('system', true)).toBe('dark')
    expect(resolveSelfOrderTheme('system', false)).toBe('light')
    expect(resolveSelfOrderTheme(undefined, true)).toBe('dark')
  })

  it('writes the brand palette onto the document', () => {
    const setProperty = vi.fn()
    const original = globalThis.document
    // @ts-expect-error minimal DOM stub for the test
    globalThis.document = { documentElement: { style: { setProperty, colorScheme: '' }, dataset: {} } }

    applySelfOrderTheme('ocean', 'dark')

    const written = new Map<string, string>()
    for (const [name, value] of setProperty.mock.calls) written.set(name, value)

    // Ocean dark palette values (see brand-palettes.ts).
    expect(written.get('--so-paper')).toBe('rgb(8 18 24)')
    expect(written.get('--so-ink')).toBe('rgb(34 211 238)')
    expect(written.get('--so-on-ink')).toBe('rgb(8 18 24)')
    expect(written.has('--so-gold-ink')).toBe(true)

    globalThis.document = original
  })

  it('derives the palette from a custom primary', () => {
    const setProperty = vi.fn()
    const original = globalThis.document
    // @ts-expect-error minimal DOM stub for the test
    globalThis.document = { documentElement: { style: { setProperty, colorScheme: '' }, dataset: {} } }

    applySelfOrderTheme('custom', 'light', '#ff0000')

    const written = new Map<string, string>()
    for (const [name, value] of setProperty.mock.calls) written.set(name, value)
    const primary = written.get('--so-ink') ?? ''
    const [r, g, b] = (primary.match(/\d+/g) ?? []).map(Number)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)

    globalThis.document = original
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
