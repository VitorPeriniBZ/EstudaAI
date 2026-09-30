import * as jose from "jose";
import { env } from "../lib/env";
import { Session } from "@contracts/constants";

const JWT_ALG = "HS256";
const ISSUER = "estudaai";

export type SessionPayload = { uid: number };

function secretKey() {
  if (!env.appSecret) throw new Error("APP_SECRET não configurado");
  return new TextEncoder().encode(env.appSecret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new jose.SignJWT({ uid: payload.uid })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(Session.maxAgeMs / 1000)}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, secretKey(), {
      algorithms: [JWT_ALG],
      issuer: ISSUER,
    });
    const uid = Number(payload.uid);
    if (!Number.isInteger(uid) || uid <= 0) return null;
    return { uid };
  } catch {
    return null;
  }
}
