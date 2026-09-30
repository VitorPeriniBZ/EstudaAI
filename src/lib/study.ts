/** Utilitários visuais do EstudaAí */

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

export function stainClass(color: string | null | undefined): string {
  return `stain-${STAINS.includes(color as Stain) ? color : "hema"}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
