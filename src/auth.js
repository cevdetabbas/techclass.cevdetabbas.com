import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }
  const [, salt, hash] = storedHash.split("$");
  if (!salt || !hash) {
    return false;
  }
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export function createRawSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) {
      return cookies;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
    return cookies;
  }, {});
}
