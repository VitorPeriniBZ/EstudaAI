/**
 * Fogos e brilho do quiz.
 *  - celebrate(x, y, streak): a cada acerto (mais fogos conforme a sequência)
 *  - celebratePerfect(): ao acertar todas — "PERFEITO" gigante piscando por 2 s
 */
import { useEffect, useRef, useState } from "react";

/** Texto exibido ao gabaritar o quiz. */
export const PERFECT_MESSAGE = "PERFEITO";

type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; decay: number;
  size: number; hue: number; kind: "dot" | "star" | "sparkle" | "rocket"; tw: number; ty?: number;
};

const HUES = [330, 45, 280, 190, 140, 15];
const pick = () => HUES[Math.floor(Math.random() * HUES.length)];

let api: { celebrate: (x: number, y: number, streak: number) => void; perfect: () => void } | null = null;
export const celebrate = (x: number, y: number, streak: number) => api?.celebrate(x, y, streak);
export const celebratePerfect = () => api?.perfect();

export default function Celebration() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [showPerfect, setShowPerfect] = useState(false);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0, H = 0, parts: Particle[] = [], raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const burst = (x: number, y: number, n: number, hue: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 5.5;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.011 + Math.random() * 0.012,
          size: 2.2 + Math.random() * 2.8, hue: hue + Math.random() * 40 - 20, kind: Math.random() < 0.22 ? "star" : "dot", tw: Math.random() * 6 });
      }
    };
    const sparkles = (n: number) => {
      for (let i = 0; i < n; i++)
        parts.push({ x: Math.random() * W, y: Math.random() * H * 0.85, vx: 0, vy: -0.15, life: 1, decay: 0.012 + Math.random() * 0.015,
          size: 5 + Math.random() * 9, hue: pick(), kind: "sparkle", tw: Math.random() * 6 });
    };
    const rocket = (x: number, y: number, hue: number) =>
      parts.push({ x, y: H + 10, vx: (x - W / 2) * 0.004, vy: -(7 + Math.random() * 3), life: 1, decay: 0, size: 2.5, hue, kind: "rocket", tw: 0, ty: y });
    const star = (x: number, y: number, r: number, rot: number) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.38 : r, a = rot + (i * Math.PI) / 4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    };
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      const out: Particle[] = [];
      for (const p of parts) {
        if (p.kind === "rocket") {
          p.x += p.vx; p.y += p.vy; p.vy += 0.12;
          ctx.fillStyle = `hsla(${p.hue},100%,62%,1)`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
          if (p.vy >= -1 || p.y <= (p.ty ?? 0)) { burst(p.x, p.y, 90, p.hue); continue; }
          out.push(p); continue;
        }
        p.x += p.vx; p.y += p.vy; p.vx *= 0.975; p.vy = p.vy * 0.975 + (p.kind === "sparkle" ? 0 : 0.07);
        p.life -= p.decay; p.tw += 0.35;
        if (p.life <= 0) continue;
        out.push(p);
        const a = Math.max(0, p.life) * (p.kind === "dot" ? 1 : 0.55 + 0.45 * Math.sin(p.tw));
        ctx.fillStyle = `hsla(${p.hue},95%,${p.kind === "sparkle" ? 62 : 55}%,${a})`;
        if (p.kind === "dot") { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life + 0.4, 0, 7); ctx.fill(); }
        else star(p.x, p.y, p.size * (p.kind === "sparkle" ? 1 : 1.8) * (0.6 + 0.4 * p.life), p.tw * 0.3);
      }
      parts = out;
      raf = parts.length ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    // quem pede menos movimento no sistema recebe uma comemoração mais discreta
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    api = {
      celebrate(x, y, streak) {
        if (calm) { burst(x, y, 30, pick()); kick(); return; }
        burst(x, y, 110, pick());
        const extra = Math.min(2 + Math.floor(streak / 3), 5);
        for (let i = 0; i < extra; i++)
          setTimeout(() => { rocket(W * (0.15 + Math.random() * 0.7), H * (0.12 + Math.random() * 0.35), pick()); kick(); }, i * 160);
        sparkles(26 + Math.min(streak, 10) * 3);
        kick();
      },
      perfect() {
        setShowPerfect(true);
        if (calm) { burst(W / 2, H / 2, 60, 330); kick(); setTimeout(() => setShowPerfect(false), 2000); return; }
        let t = 0;
        const iv = setInterval(() => { rocket(W * (0.08 + Math.random() * 0.84), H * (0.08 + Math.random() * 0.45), HUES[t++ % HUES.length]); sparkles(18); kick(); }, 140);
        burst(W / 2, H / 2, 160, 330); kick();
        setTimeout(() => { clearInterval(iv); setShowPerfect(false); }, 2000);
      },
    };
    return () => { api = null; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-40 h-full w-full" />
      {showPerfect && (
        <div aria-live="assertive" className="celebrate-overlay pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
          <span className="celebrate-text">{PERFECT_MESSAGE}</span>
        </div>
      )}
    </>
  );
}
