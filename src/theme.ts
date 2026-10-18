import { Color } from 'three'

/** Reads a CSS custom property from :root (so WebGL follows the same theme as the DOM). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

let cached: ThemePalette | null = null

export interface ThemePalette {
  accent: Color
  glow: Color
  warm: Color
}

/** Palette for 3D scenes. Computed once, on first use (after CSS has loaded). */
export function palette(): ThemePalette {
  if (!cached) {
    cached = {
      accent: new Color(cssVar('--accent', '#e11d2e')),
      glow: new Color(cssVar('--accent-glow', '#ff4757')),
      warm: new Color(cssVar('--accent-2', '#ffb347')),
    }
  }
  return cached
}
