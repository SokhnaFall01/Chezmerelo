const crypto = require('node:crypto');
const { getSetting, setSetting } = require('./db');

const COOKIE = 'cml_admin';
const SESSION_DAYS = 30;

function secret() {
  let s = getSetting('session_secret', null);
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', s);
  }
  return s;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function storedHash() {
  let h = getSetting('admin_password', null);
  if (!h) {
    const initial = process.env.ADMIN_PASSWORD || 'merelo2026';
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('⚠  Mot de passe admin par défaut « merelo2026 » — changez-le dans l\'admin (onglet Compte).');
    }
    h = hashPassword(initial);
    setSetting('admin_password', h);
  }
  return h;
}

function checkPassword(password) {
  const [salt, hash] = storedHash().split(':');
  const candidate = crypto.scryptSync(String(password || ''), salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function setPassword(password) {
  setSetting('admin_password', hashPassword(password));
}

// Le jeton dépend du mot de passe : changer de mot de passe déconnecte toutes les sessions.
function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload + '|' + storedHash()).digest('base64url');
}

function createToken() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = String(exp);
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || Number(payload) < Date.now()) return false;
  const expected = Buffer.from(sign(payload));
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

function login(req, res) {
  setCookie(res, req, createToken(), SESSION_DAYS * 86400);
}

function logout(req, res) {
  setCookie(res, req, '', 0);
}

function isAdmin(req) {
  return verifyToken(readCookie(req));
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Non connecté' });
}

module.exports = { checkPassword, setPassword, login, logout, isAdmin, requireAdmin, storedHash };
