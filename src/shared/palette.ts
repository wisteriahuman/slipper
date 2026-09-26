// Colors are referenced by theme color name so the slide follows the deck's theme. Whether a color
// may be used freely is decided by its actual hue, not its name: themes put colored values in any
// slot (a deck's DARK1 can be teal). A colored value may only be used once its meaning is written
// down; color without meaning makes the audience look for a message that isn't there.
export const THEME_COLORS = ['DARK1', 'LIGHT1', 'DARK2', 'LIGHT2', 'ACCENT1', 'ACCENT2', 'ACCENT3', 'ACCENT4', 'ACCENT5', 'ACCENT6'] as const;
export const MAX_ACCENT_USES = 2;

export type ColorMeaning = {ref: string; meaning: string};
export type Palette = {hex: Record<string, string>; meanings: ColorMeaning[]};

// Chroma = max − min of the RGB channels; greys and near-greys stay below the threshold.
const NEUTRAL_CHROMA = 0.12;
export function chroma(hex: string): number {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => parseInt(v!, 16) / 255) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// Unknown hex (theme unreadable): only the base text and background slots are assumed neutral.
export function needsMeaning(palette: Palette, ref: string): boolean {
  const hex = palette.hex[ref];
  if (!hex) return !(ref === 'DARK1' || ref === 'LIGHT1');
  return chroma(hex) >= NEUTRAL_CHROMA;
}

const hasMeaning = (palette: Palette, ref: string) => palette.meanings.some(m => m.ref === ref && m.meaning.trim());

export function allowedColors(palette: Palette): string[] {
  return THEME_COLORS.filter(ref => !needsMeaning(palette, ref) || hasMeaning(palette, ref));
}

// Colored theme slots, i.e. the ones the user can give a meaning to.
export const coloredSlots = (palette: Palette) => THEME_COLORS.filter(ref => needsMeaning(palette, ref));

export function colorHex(palette: Palette, ref: string | undefined, fallback: string): string {
  return (ref && palette.hex[ref]) || fallback;
}
