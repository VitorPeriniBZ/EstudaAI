import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

/**
 * Front e API ficam no mesmo domínio, então SameSite=Lax basta
 * (e é o que permite o cookie voltar no redirecionamento do Google).
 */
export function getSessionCookieOptions(headers: Headers): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: !isLocalhost(headers),
  };
}
