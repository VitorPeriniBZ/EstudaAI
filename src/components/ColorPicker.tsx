import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Input } from "@/components/ui/input";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "@/lib/color";

const HUE_GRADIENT =
  "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Seletor de cor: quadrado de saturação × brilho, barra de matiz e código hex.
 * Funciona com mouse, toque (arrastar) e teclado (setas; Shift = passo maior).
 * O valor inicial é lido na montagem — para reiniciar, troque a `key`.
 */
export default function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  // valor mais recente para os eventos de arrasto (vários eventos antes de re-renderizar)
  const latest = useRef(hsv);
  const area = useRef<HTMLDivElement>(null);
  const hueBar = useRef<HTMLDivElement>(null);

  function emit(next: Hsv) {
    latest.current = next;
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  }

  function pickArea(e: PointerEvent<HTMLDivElement>) {
    const r = area.current!.getBoundingClientRect();
    emit({ ...latest.current, s: clamp01((e.clientX - r.left) / r.width), v: 1 - clamp01((e.clientY - r.top) / r.height) });
  }
  function pickHue(e: PointerEvent<HTMLDivElement>) {
    const r = hueBar.current!.getBoundingClientRect();
    emit({ ...latest.current, h: clamp01((e.clientX - r.left) / r.width) * 360 });
  }
  // arrastar: captura o ponteiro no primeiro toque e segue enquanto ele estiver preso
  const startDrag = (e: PointerEvent<HTMLDivElement>) => e.currentTarget.setPointerCapture(e.pointerId);
  const dragging = (e: PointerEvent<HTMLDivElement>) => e.currentTarget.hasPointerCapture(e.pointerId);

  function areaKeys(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const c = latest.current;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp01(c.s - step) },
      ArrowRight: { s: clamp01(c.s + step) },
      ArrowUp: { v: clamp01(c.v + step) },
      ArrowDown: { v: clamp01(c.v - step) },
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    emit({ ...c, ...moves[e.key] });
  }
  function hueKeys(e: KeyboardEvent) {
    const step = e.shiftKey ? 15 : 2;
    const c = latest.current;
    const moves: Record<string, number> = {
      ArrowLeft: c.h - step, ArrowDown: c.h - step,
      ArrowRight: c.h + step, ArrowUp: c.h + step,
      Home: 0, End: 360,
    };
    if (moves[e.key] === undefined) return;
    e.preventDefault();
    emit({ ...c, h: Math.min(360, Math.max(0, moves[e.key])) });
  }

  function typeHex(text: string) {
    setHexText(text);
    const hex = normalizeHex(text.startsWith("#") ? text : `#${text}`);
    if (!hex) return;
    const next = hexToHsv(hex);
    latest.current = next;
    setHsv(next);
    onChange(hex);
  }

  const hex = hsvToHex(hsv);
  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div>
      <div className="flex gap-3">
        <div className="w-14 shrink-0 rounded-md border" style={{ backgroundColor: hex }} aria-hidden />
        <div
          ref={area}
          role="slider"
          tabIndex={0}
          aria-label="Saturação e brilho"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
          onKeyDown={areaKeys}
          onPointerDown={(e) => { startDrag(e); pickArea(e); }}
          onPointerMove={(e) => { if (dragging(e)) pickArea(e); }}
          className="relative h-36 flex-1 cursor-crosshair touch-none rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ backgroundColor: pureHue }}
        >
          <div className="absolute inset-0 rounded-md" style={{ background: "linear-gradient(to right, #fff, rgba(255,255,255,0))" }} />
          <div className="absolute inset-0 rounded-md" style={{ background: "linear-gradient(to top, #000, rgba(0,0,0,0))" }} />
          <span
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>
      </div>

      {/* área de toque de 24px; a barra visível tem 12px */}
      <div
        ref={hueBar}
        role="slider"
        tabIndex={0}
        aria-label="Matiz"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={hueKeys}
        onPointerDown={(e) => { startDrag(e); pickHue(e); }}
        onPointerMove={(e) => { if (dragging(e)) pickHue(e); }}
        className="relative mt-4 h-6 cursor-pointer touch-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full" style={{ background: HUE_GRADIENT }} />
        <span
          className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHue }}
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <span className="font-semibold">Código</span>
        <Input
          value={hexText}
          onChange={(e) => typeHex(e.target.value)}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          className="h-9 font-mono"
          aria-label="Código da cor (hexadecimal)"
        />
      </label>
    </div>
  );
}
