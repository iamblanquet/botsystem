import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
export const SESSION_COOKIE = 'nexo_admin_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const parameters = { N: 16384, r: 8, p: 1 };

/** @param {string} password */
export async function hashPassword(password) {
  if (password.length < 12 || password.length > 256) throw new Error('Usa una contraseña de entre 12 y 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, parameters);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}
/** @param {string} password @param {string} encoded */
export async function verifyPassword(password, encoded) {
  if (password.length > 256 || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
  const [, salt, expected] = encoded.split('$');
  const key = await scrypt(password, salt, 64, parameters);
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected, 'hex'));
}
export function adminConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!email || !hash || !secret || secret.length < 32 || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) return null;
  return { email, hash, secret, userId: process.env.ADMIN_USER_ID || 'admin' };
}
/** @param {{email: string, userId: string, secret: string}} config @param {number} now */
export function createSession(config, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: config.userId, email: config.email, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
/** @param {string | undefined} token @param {{email: string, userId: string, secret: string}} config @param {number} now */
export function sessionUser(token, config, now = Date.now()) {
  if (!token || token.length > 2048) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac('sha256', config.secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    if (data.uid !== config.userId || data.email !== config.email || !Number.isInteger(data.iat) || !Number.isInteger(data.exp) || data.exp <= seconds || data.iat > seconds + 30 || data.exp - data.iat !== SESSION_SECONDS) return null;
    return { userId: config.userId, email: config.email, displayName: 'Administrador', fullName: null };
  } catch { return null; }
}
/** @param {string} value */
export function safeReturnPath(value = '/') {
  try {
    const url = new URL(value, 'https://nexo.invalid');
    if (!value.startsWith('/') || url.origin !== 'https://nexo.invalid' || /^\/(login|signin-with-chatgpt|signout-with-chatgpt)(\/|$)/.test(url.pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}
