/**
 * Login com Google — OAuth 2.0 "authorization code" + OpenID Connect.
 *
 *   GET /api/auth/google           → redireciona para a tela de contas do Google
 *   GET /api/auth/google/callback  → Google devolve ?code=…; trocamos pelo id_token,
 *                                    validamos a assinatura, criamos/atualizamos o
 *                                    usuário e gravamos o cookie de sessão (JWT httpOnly).
 *
 * Proteções: parâmetro `state` (anti-CSRF) + PKCE (S256), ambos guardados num
 * cookie httpOnly de 10 minutos; id_token validado contra as chaves públicas do
 * Google (issuer + audience).
 */
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Paths, Session } from "@contracts/constants";
import { signSessionToken, verifySessionToken } from "./session";
import { findUserById, upsertGoogleUser } from "../queries/users";

// Endpoints do Google. As variáveis GOOGLE_*_URL existem só para testes locais
// com um servidor falso — em produção, não defina.
const GOOGLE = {
  authUrl: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  jwksUrl: process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
  issuers: process.env.GOOGLE_ISSUER
    ? [process.env.GOOGLE_ISSUER]
    : ["https://accounts.google.com", "accounts.google.com"],
};

const OAUTH_COOKIE = "estudaai_oauth";
const jwks = jose.createRemoteJWKSet(new URL(GOOGLE.jwksUrl));

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
function randomToken(len = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}
async function sha256b64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return b64url(new Uint8Array(digest));
}

/** Origem pública do site: APP_URL/RENDER_EXTERNAL_URL, senão deduz da requisição. */
function publicOrigin(c: Context): string {
  if (env.appUrl) return env.appUrl;
  const proto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(c.req.url).protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
  return `${proto}://${host}`;
}

function redirectUri(c: Context): string {
  return `${publicOrigin(c)}${Paths.googleCallback}`;
}

/** Só aceita caminhos internos em ?next= (evita open redirect). */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

function loginError(c: Context, code: string) {
  return c.redirect(`${Paths.login}?erro=${encodeURIComponent(code)}`, 302);
}

export function googleStartHandler() {
  return async (c: Context) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return loginError(c, "google_nao_configurado");
    }
    const state = randomToken();
    const verifier = randomToken(48);
    const challenge = await sha256b64url(verifier);
    const next = safeNext(c.req.query("next"));

    setCookie(c, OAUTH_COOKIE, JSON.stringify({ s: state, v: verifier, n: next }), {
      ...getSessionCookieOptions(c.req.raw.headers),
      maxAge: 10 * 60,
    });

    const url = new URL(GOOGLE.authUrl);
    url.searchParams.set("client_id", env.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri(c));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return c.redirect(url.toString(), 302);
  };
}

type GoogleIdToken = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export function googleCallbackHandler() {
  return async (c: Context) => {
    const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
    const raw = getCookie(c, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: cookieOpts.path, secure: cookieOpts.secure });

    const error = c.req.query("error");
    if (error) {
      return loginError(c, error === "access_denied" ? "cancelado" : "google_recusou");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    let saved: { s?: string; v?: string; n?: string } = {};
    try {
      saved = raw ? JSON.parse(raw) : {};
    } catch {
      saved = {};
    }
    if (!code || !state || !saved.s || saved.s !== state || !saved.v) {
      return loginError(c, "sessao_expirada");
    }

    try {
      // 1) troca o code pelo id_token
      const tokenResp = await fetch(GOOGLE.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: redirectUri(c),
          code_verifier: saved.v,
        }).toString(),
      });
      if (!tokenResp.ok) {
        console.error("[google] troca do code falhou", tokenResp.status, await tokenResp.text());
        return loginError(c, "google_falhou");
      }
      const tokens = (await tokenResp.json()) as { id_token?: string };
      if (!tokens.id_token) return loginError(c, "google_falhou");

      // 2) valida o id_token (assinatura, emissor, público-alvo, validade)
      const { payload } = await jose.jwtVerify<GoogleIdToken>(tokens.id_token, jwks, {
        issuer: GOOGLE.issuers,
        audience: env.googleClientId,
      });
      if (!payload.sub) return loginError(c, "google_falhou");

      // 3) cria/atualiza o usuário (e-mail só é aceito se verificado pelo Google)
      const user = await upsertGoogleUser({
        sub: payload.sub,
        email: payload.email && payload.email_verified !== false ? payload.email : null,
        name: payload.name ?? payload.email ?? null,
        picture: payload.picture ?? null,
      });

      // 4) sessão própria do EstudaAí
      const token = await signSessionToken({ uid: user.id });
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Math.floor(Session.maxAgeMs / 1000),
      });
      return c.redirect(safeNext(saved.n), 302);
    } catch (err) {
      console.error("[google] callback falhou", err);
      return loginError(c, "google_falhou");
    }
  };
}

/** Lê o cookie de sessão e devolve o usuário (ou undefined). */
export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) return undefined;
  const claim = await verifySessionToken(token);
  if (!claim) return undefined;
  return findUserById(claim.uid);
}
