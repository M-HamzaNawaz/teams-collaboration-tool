/**
 * Color themes (Slack-style). Each theme is ONE fixed look — some light,
 * some dark — not a light/dark pair. The id is what lands in
 * profiles.theme and on <html data-theme>; the actual token values live in
 * globals.css under a matching [data-theme="<id>"] block.
 *
 * `swatch` is only for the picker UI (the little preview chips): base is the
 * page background, accent is the theme's accent colour.
 */

export type ThemeDef = {
  id: string
  label: string
  dark: boolean
  /** rail = the dock's bold theme color — the theme's signature. */
  swatch: { base: string; surface: string; accent: string; rail: string }
}

export const THEMES: ThemeDef[] = [
  {
    id: 'classic-light',
    label: 'Classic Light',
    dark: false,
    swatch: { base: '#f5f7f7', surface: '#ffffff', accent: '#5fa69e', rail: '#ffffff' },
  },
  {
    id: 'classic-dark',
    label: 'Classic Dark',
    dark: true,
    swatch: { base: '#121415', surface: '#1a1d1e', accent: '#a2cfc9', rail: '#101213' },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    dark: false,
    swatch: { base: '#f3f6fb', surface: '#ffffff', accent: '#2563eb', rail: '#1e40af' },
  },
  {
    id: 'forest',
    label: 'Forest',
    dark: false,
    swatch: { base: '#f3f8f4', surface: '#ffffff', accent: '#2f8f5b', rail: '#1c6a43' },
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    dark: true,
    swatch: { base: '#1b1424', surface: '#251a31', accent: '#c4a5e0', rail: '#3f1d4e' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    dark: true,
    swatch: { base: '#0f1420', surface: '#171d2b', accent: '#8fa8f0', rail: '#0a0f1d' },
  },
]

export const DEFAULT_THEME = 'classic-light'

export function isValidTheme(id: string | null | undefined): id is string {
  return !!id && THEMES.some((t) => t.id === id)
}
