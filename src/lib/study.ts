/** Utilitários visuais do EstudaAí */
import type { CSSProperties } from "react";
import { deriveStainVars, isHexColor } from "./color";

export const STAINS = ["hema", "giemsa", "lugol", "madder", "neutral"] as const;
export type Stain = (typeof STAINS)[number];

export const STAIN_LABELS: Record<Stain, string> = {
  hema: "Azul",
  giemsa: "Roxo",
  lugol: "Âmbar",
  madder: "Rosa",
  neutral: "Grafite",
};

/** Amostras das cores para o seletor (mesmos valores do index.css, tema claro) */
export const STAIN_SWATCH: Record<Stain, string> = {
  hema: "#2C5F8A",
  giemsa: "#6A3D9A",
  lugol: "#9A5E14",
  madder: "#B23A5A",
  neutral: "#44545D",
};

export function isStain(color: unknown): color is Stain {
  return STAINS.includes(color as Stain);
}

/** Classe da cor da matéria: uma das prontas ou "stain-custom" (cor #rrggbb, ver stainStyle). */
export function stainClass(color: string | null | undefined): string {
  if (isHexColor(color)) return "stain-custom";
  return `stain-${isStain(color) ? color : "hema"}`;
}

/** Variáveis da cor personalizada (claro e escuro); undefined para as cores prontas. */
export function stainStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!isHexColor(color)) return undefined;
  const { light, dark } = deriveStainVars(color);
  return {
    "--c-stain": light.stain,
    "--c-stain-soft": light.soft,
    "--c-stain-ink": light.ink,
    "--c-stain-dark": dark.stain,
    "--c-stain-soft-dark": dark.soft,
    "--c-stain-ink-dark": dark.ink,
  } as CSSProperties;
}

/** Cor da bolinha no seletor (a própria cor personalizada, ou a amostra da cor pronta). */
export function swatchColor(color: string): string {
  return isHexColor(color) ? color : STAIN_SWATCH[isStain(color) ? color : "hema"];
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
