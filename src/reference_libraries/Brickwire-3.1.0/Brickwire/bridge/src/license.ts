/**
 * PRO license: an Ed25519-signed token "base64url(payload).base64url(signature)".
 * payload = { id, email, plan: "pro" | "team", exp: ISO date | null, issued }
 * Tokens are made with scripts/license-sign.mjs and the PRIVATE key that only the seller keeps.
 * The app only has the public key below (override: BRICKWIRE_LICENSE_PUBKEY = base64 DER/SPKI).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAPQl78bPRaTXEgmYjfOjdrHkx7bRYG/lBG9iJhY82VCQ=";

export interface LicensePayload {
  id: string;
  email: string;
  plan: "pro" | "team";
  exp: string | null;
  issued: string;
}
export interface LicenseState {
  pro: boolean;
  plan: "free" | "pro" | "team";
  email?: string;
  exp?: string | null;
  error?: string;
}

/** Free-tier limits (PRO removes them). */
export const FREE_LIMITS = { historyDays: 7, libraryItems: 5 };

export function verifyLicense(token: string, pubB64 = process.env.BRICKWIRE_LICENSE_PUBKEY || PUBLIC_KEY_B64, now = Date.now()): LicenseState {
  try {
    const [p, s] = token.trim().split(".");
    if (!p || !s) return { pro: false, plan: "free", error: "malformed key" };
    const key = crypto.createPublicKey({ key: Buffer.from(pubB64, "base64"), format: "der", type: "spki" });
    if (!crypto.verify(null, Buffer.from(p), key, Buffer.from(s, "base64url"))) return { pro: false, plan: "free", error: "invalid signature" };
    const pl = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as LicensePayload;
    if (pl.exp && Date.parse(pl.exp) < now) return { pro: false, plan: "free", email: pl.email, exp: pl.exp, error: "license expired" };
    return { pro: true, plan: pl.plan === "team" ? "team" : "pro", email: pl.email, exp: pl.exp };
  } catch (e) {
    return { pro: false, plan: "free", error: "invalid key (" + (e as Error).message + ")" };
  }
}

export function signLicense(payload: LicensePayload, privatePem: string): string {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.sign(null, Buffer.from(p), crypto.createPrivateKey(privatePem)).toString("base64url");
  return `${p}.${sig}`;
}

export class LicenseManager {
  private file: string;
  private cached: LicenseState | null = null;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, "license.key");
  }
  state(): LicenseState {
    if (this.cached && (!this.cached.exp || Date.parse(this.cached.exp) > Date.now())) return this.cached;
    let token = process.env.BRICKWIRE_LICENSE ?? "";
    try {
      token ||= fs.readFileSync(this.file, "utf8");
    } catch {
      /* no key yet */
    }
    this.cached = token.trim() ? verifyLicense(token) : { pro: false, plan: "free" };
    return this.cached;
  }
  get pro() {
    return this.state().pro;
  }
  activate(token: string): LicenseState {
    const st = verifyLicense(token);
    if (st.pro) {
      fs.writeFileSync(this.file, token.trim());
      this.cached = st;
    }
    return st;
  }
  deactivate() {
    try {
      fs.unlinkSync(this.file);
    } catch {
      /* none */
    }
    this.cached = { pro: false, plan: "free" };
  }
}
