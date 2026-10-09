import { describe, expect, it } from 'vitest'
import {
  deriveBrandPaletteFromBase,
  normalizeCustomBase,
  type CustomPaletteBase,
} from './derive-brand-palette.ts'
import { resolveBrandPalette } from './brand-palettes.ts'

const BASE: CustomPaletteBase = {
  canvas: '#102030',
  surface: '#203040',
  foreground: '#e0d0c0',
  primary: '#ff8800',
}

describe('four-color custom palette', () => {
  it('uses the base colors directly in light mode', () => {
    const palette = deriveBrandPaletteFromBase(BASE, 'light')
    expect(palette.canvas).toBe('16 32 48')
    expect(palette.surface).toBe('32 48 64')
    expect(palette.foreground).toBe('224 208 192')
    expect(palette.primary).toBe('255 136 0')
  })

  it('derives a dark palette (dark surfaces, light text) from the base', () => {
    const light: CustomPaletteBase = { canvas: '#ffffff', surface: '#f5f5f5', foreground: '#111111', primary: '#0046fe' }
    const dark = deriveBrandPaletteFromBase(light, 'dark')
    const [r, g, b] = dark.canvas.split(' ').map(Number)
    expect(r).toBeLessThan(60)
    expect(g).toBeLessThan(60)
    expect(b).toBeLessThan(60)
    expect(Number(dark.foreground.split(' ')[0])).toBeGreaterThan(180)
  })

  it('keeps neutral gray palettes gray in dark mode', () => {
    const gray: CustomPaletteBase = { canvas: '#333333', surface: '#aaaaaa', foreground: '#eeeeee', primary: '#cccccc' }
    const dark = deriveBrandPaletteFromBase(gray, 'dark')
    for (const key of ['canvas', 'surface', 'surfaceElevated', 'foreground', 'muted', 'border', 'primary'] as const) {
      const [r, g, b] = dark[key].split(' ').map(Number)
      expect(Math.abs(r - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(g - b)).toBeLessThanOrEqual(1)
    }
  })

  it('seeds missing base colors from a legacy single primary', () => {
    const base = normalizeCustomBase('#0046fe')
    expect(base.primary).toBe('#0046fe')
    expect(base.canvas).toMatch(/^#[0-9a-f]{6}$/)
    expect(base.surface).toMatch(/^#[0-9a-f]{6}$/)
    expect(base.foreground).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('resolveBrandPalette keeps a gray custom primary neutral in dark mode', () => {
    const palette = resolveBrandPalette('custom', 'dark', '#cccccc')
    for (const key of ['canvas', 'surface', 'surfaceElevated', 'foreground', 'muted', 'border', 'primary'] as const) {
      const [r, g, b] = palette[key].split(' ').map(Number)
      expect(Math.abs(r - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(g - b)).toBeLessThanOrEqual(1)
    }
  })
})
