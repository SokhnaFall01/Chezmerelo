const crypto = require('node:crypto');
const { getSetting, setSetting, run } = require('./db');

const COOKIE = 'cml_admin';
const SESSION_DAYS = 30;

async function secret() {
  let s = await getSetting('session_secret', null);
  if (!s) {
    await run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['session_secret', JSON.stringify(crypto.randomBytes(32).toString('hex'))]);
    s = await getSetting('session_secret', null);
  }
  return s;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function storedHash() {
  let h = await getSetting('admin_password', null);
  if (!h) {
    const initial = process.env.ADMIN_PASSWORD || 'merelo2026';
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('⚠  Mot de passe admin par défaut « merelo2026 » — changez-le dans l\'admin (onglet Compte).');
    }
    await run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['admin_password', JSON.stringify(hashPassword(initial))]);
    h = await getSetting('admin_password', null);
  }
  return h;
}

async function checkPassword(password) {
  const [salt, hash] = (await storedHash()).split(':');
  const candidate = crypto.scryptSync(String(password || ''), salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

async function setPassword(password) {
  await setSetting('admin_password', hashPassword(password));
}

// Le jeton dépend du mot de passe : changer de mot de passe déconnecte toutes les sessions.
async function sign(payload) {
  return crypto.createHmac('sha256', await secret()).update(payload + '|' + (await storedHash())).digest('base64url');
}

async function createToken() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = String(exp);
  return `${payload}.${await sign(payload)}`;
}

async function verifyToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || Number(payload) < Date.now()) return false;
  const expected = Buffer.from(await sign(payload));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setCookie(res, req, value, maxAgeSec) {
  const attrs = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (req.secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

async function login(req, res) {
  setCookie(res, req, await createToken(), SESSION_DAYS * 86400);
}

function logout(req, res) {
  setCookie(res, req, '', 0);
}

async function isAdmin(req) {
  return verifyToken(readCookie(req));
}

async function requireAdmin(req, res, next) {
  if (await isAdmin(req)) return next();
  res.status(401).json({ error: 'Non connecté' });
}

module.exports = { checkPassword, setPassword, login, logout, isAdmin, requireAdmin, storedHash };
