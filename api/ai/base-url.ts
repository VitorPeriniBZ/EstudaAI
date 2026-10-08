/**
 * Validação da Base URL dos provedores de IA (painel admin).
 *
 * A Base URL recebe a chave de API em cada chamada e é acessada pelo servidor, então não
 * pode apontar para a rede interna: localhost, IPs privados, link-local (metadados de nuvem
 * em 169.254.169.254) etc. Isso evita SSRF a partir do painel admin.
 *
 * O agente de testes usa servidores falsos em localhost e liga AI_ALLOW_PRIVATE_BASEURL=1
 * (env.allowPrivateBaseUrl); sem a variável, o bloqueio vale.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../lib/env";

const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // "esta rede"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (metadados de nuvem)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && ip.split(".")[2] === "0") || // 192.0.0.0/24
    (a === 198 && (b === 18 || b === 19)) || // benchmark
    a >= 224 // multicast e reservados
  );
}

/** Expande um IPv6 para 8 grupos de 16 bits (aceita "::" e IPv4 embutido no fim). */
function ipv6Groups(ip: string): number[] {
  let s = ip.toLowerCase().split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const zeros = tail !== undefined ? 8 - h.length - t.length : 0;
  return [...h, ...Array(zeros).fill("0"), ...t].map((g) => parseInt(g || "0", 16));
}

function ipv6Private(ip: string): boolean {
  const g = ipv6Groups(ip);
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: e ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipv4Private(embeddedV4()); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return ipv4Private(embeddedV4()); // ::a.b.c.d (obsoleto)
  if (g[0] === 0x64 && g[1] === 0xff9b) return ipv4Private(embeddedV4()); // NAT64
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 (rede local)
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 (link-local)
    (g[0] & 0xff00) === 0xff00 // multicast
  );
}

/** true se o IP (v4 ou v6) é da rede interna/loopback/link-local/reservado. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4Private(ip);
  if (kind === 6) return ipv6Private(ip);
  return false;
}

/** Host da URL sem colchetes de IPv6 (o parser já normaliza "2130706433" → "127.0.0.1"). */
function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function privateName(host: string): boolean {
  return host === "localhost" || PRIVATE_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

type Resolver = (host: string) => Promise<string[]>;
const dnsResolve: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Confere a Base URL ao salvar um provedor. Devolve a mensagem de erro, ou null se estiver ok.
 * Resolve o nome no DNS: um domínio que aponta para IP interno também é recusado.
 */
export async function checkProviderBaseUrl(
  raw: string,
  opts: { allowPrivate?: boolean; resolve?: Resolver } = {},
): Promise<string | null> {
  const allowPrivate = opts.allowPrivate ?? env.allowPrivateBaseUrl;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Base URL inválida.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "A Base URL precisa começar com https://";
  }
  if (allowPrivate) return null;

  const host = hostOf(url);
  const blocked = "A Base URL não pode apontar para localhost ou para a rede interna (IP privado).";
  if (privateName(host) || isPrivateIp(host)) return blocked;
  if (isIP(host)) return null;

  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? dnsResolve)(host);
  } catch {
    return `Não foi possível encontrar o endereço "${host}". Confira a Base URL.`;
  }
  return addresses.some(isPrivateIp) ? blocked : null;
}

/**
 * Checagem rápida (sem DNS) na hora de usar um provedor já salvo: provedores gravados antes
 * desta validação com localhost/IP privado são ignorados.
 */
export function literalBaseUrlProblem(raw: string | null, allowPrivate = env.allowPrivateBaseUrl): string | null {
  if (!raw || allowPrivate) return null;
  try {
    const host = hostOf(new URL(raw));
    return privateName(host) || isPrivateIp(host) ? "Base URL aponta para a rede interna" : null;
  } catch {
    return "Base URL inválida";
  }
}
