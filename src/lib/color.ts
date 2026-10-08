/**
 * Cores personalizadas das matérias (#rrggbb).
 *
 * A cor escolhida vira as mesmas variáveis das cores prontas (--stain, --stain-soft,
 * --stain-ink), para o tema claro e o escuro. Se a cor não tiver contraste suficiente
 * para os textos que ficam sobre ela (ou com ela), o tom é ajustado — clareado ou
 * escurecido — até chegar a 4.5:1 (WCAG AA). Cor que já é legível fica como foi escolhida.
 */

export type Hsv = { h: number; s: number; v: number };
type Hsl = { h: number; s: number; l: number };

const HEX = /^#[0-9a-f]{6}$/i;

/** "#AbC123" → "#abc123"; qualquer outra coisa → null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  return HEX.test(v) ? v.toLowerCase() : null;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) => Math.round(clamp01(x / 255) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hexToHsl(hex: string): Hsl {
  const { h, s: sv, v } = hexToHsv(hex);
  const l = v * (1 - sv / 2);
  const s = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Luminância relativa (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Anda na luminosidade (passo `step`, para clarear >0 ou escurecer <0) a partir de `start`
 * até a cor ter contraste ≥ `min` com todos os `against`.
 */
function adjust(hsl: Hsl, start: number, step: number, against: string[], min = 4.5): string {
  let l = clamp01(start);
  let hex = hslToHex({ ...hsl, l });
  while (against.some((c) => contrast(hex, c) < min)) {
    const next = clamp01(l + step);
    if (next === l) break; // chegou ao preto/branco
    l = next;
    hex = hslToHex({ ...hsl, l });
  }
  return hex;
}

// fundos do app (index.css): texto do rótulo do cartão e fundos dos cards
const LIGHT_LABEL_TEXT = "#ffffff";
const LIGHT_CARD = "#ffffff";
const LIGHT_BACKGROUND = "#edf1f2";
const DARK_LABEL_TEXT = "#131a1f";
const DARK_CARD = "#1b242a";

export type StainVars = { stain: string; soft: string; ink: string };

/** Variáveis da cor da matéria para o tema claro e o escuro, com contraste garantido. */
export function deriveStainVars(hex: string): { light: StainVars; dark: StainVars } {
  const base = hexToHsl(hex);
  const lightSoft = hslToHex({ h: base.h, s: Math.min(base.s, 0.5), l: 0.93 });
  const darkSoft = hslToHex({ h: base.h, s: Math.min(base.s, 0.3), l: 0.17 });
  return {
    light: {
      // texto branco sobre a cor (rótulo do cartão): escurece se precisar
      stain: adjust(base, base.l, -0.01, [LIGHT_LABEL_TEXT]),
      soft: lightSoft,
      // texto colorido sobre o card, o fundo e o tom suave
      ink: adjust(base, Math.min(base.l, 0.3), -0.01, [LIGHT_CARD, LIGHT_BACKGROUND, lightSoft]),
    },
    dark: {
      // texto escuro sobre a cor: clareia se precisar
      stain: adjust(base, Math.max(base.l, 0.55), 0.01, [DARK_LABEL_TEXT]),
      soft: darkSoft,
      ink: adjust({ ...base, s: Math.min(base.s, 0.7) }, Math.max(base.l, 0.82), 0.01, [DARK_CARD, darkSoft]),
    },
  };
}
