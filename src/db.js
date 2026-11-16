const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@libsql/client');

// En ligne (Vercel) : base Turso via TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
// Sur un ordinateur : fichier SQLite local dans DATA_DIR.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!REMOTE_URL) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!REMOTE_URL && process.env.VERCEL) {
  console.error('TURSO_DATABASE_URL manquant : connectez une base Turso au projet Vercel.');
}

const db = createClient({
  url: REMOTE_URL || 'file:' + path.join(DATA_DIR, 'chezmerelo.db'),
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  size        TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  image       TEXT NOT NULL DEFAULT '',
  texture     TEXT NOT NULL DEFAULT '',
  visible     INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address    TEXT NOT NULL DEFAULT '',
  zone       TEXT NOT NULL DEFAULT '',
  delivery   INTEGER NOT NULL DEFAULT 0,
  payment    TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  subtotal   INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'nouvelle'
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name       TEXT NOT NULL,
  price      INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);
`;

// Contenu par défaut de la page d'accueil (modifiable depuis l'admin).
const DEFAULT_SITE = {
  hero: [
    { image: '', texture: 't-bazin', kicker: 'COLLECTION BAZIN RICHE', title: 'De mère en fille,', titleEm: "l'art du beau tissu.", text: 'Des bazins au lustre profond, choisis un à un pour les cérémonies qui comptent.' },
    { image: '', texture: 't-getzner', kicker: 'GETZNER', title: "L'éclat", titleEm: "de l'or.", text: 'Les plus beaux getzners, brodés et brillants, sélectionnés pièce par pièce.' },
    { image: '', texture: 't-dentelle', kicker: 'DENTELLES', title: 'La finesse', titleEm: 'en héritage.', text: 'Des dentelles délicates pour les mariées, les baptêmes et les grandes soirées.' },
    { image: '', texture: 't-wax', kicker: 'WAX DE PRESTIGE', title: 'Des motifs', titleEm: 'qui racontent.', text: 'Des wax aux couleurs vibrantes, choisis pour leur tenue et leur éclat.' }
  ],
  house: {
    title: "L'élégance se choisit",
    titleEm: 'au mètre près.',
    text: "Depuis HLM Grand Yoff, Chez Mère Lo sélectionne des tissus de luxe pour les grandes occasions comme pour l'élégance du quotidien : bazins, getzners, dentelles, wax et brocarts.\n\nChaque pièce est choisie à la main, pour sa tenue, son éclat et sa qualité. Ici, on prend le temps de toucher la matière et de conseiller chaque cliente."
  },
  founder: {
    photo: '',
    name: 'Khadidiatou Fall',
    quote: "Ma mère m'a appris à reconnaître un beau tissu au toucher. Cette maison porte son nom.",
    bio: "Mère Lo, c'est sa mère : celle qui lui a transmis le goût des belles étoffes et le sens de l'accueil. En fondant la maison, Khadidiatou Fall a voulu lui rendre hommage et perpétuer ce savoir-faire, de mère en fille."
  },
  gallery: [],
  services: [
    { title: 'Vente à la pièce', text: 'Tissus de luxe vendus en pièces complètes, en boutique comme en ligne.' },
    { title: 'Conseil personnalisé', text: 'Aide au choix des matières et des couleurs pour mariages, baptêmes, Tabaski et Korité.' },
    { title: 'Commandes de groupe', text: "Assortiments coordonnés pour les familles et les « ndieuké » d'une même cérémonie." },
    { title: 'Livraison', text: 'Livraison à Dakar, envoi vers les régions et la diaspora.' }
  ],
  categories: ['Bazin riche', 'Getzner', 'Dentelle', 'Wax', 'Brocart'],
  contact: {
    address: 'HLM Grand Yoff, à côté de la dibiterie Koromack Faye — Dakar',
    phone: '+221 77 477 01 74',
    whatsapp: '221774770174',
    phone2Label: 'AWA',
    phone2: '+221 76 811 09 67',
    hours: '',
    mapsUrl: 'https://www.google.com/maps/search/HLM+Grand+Yoff+Dakar',
    tiktok: '',
    facebook: '',
    instagram: ''
  },
  delivery: [
    { name: 'Retrait en boutique (HLM Grand Yoff)', price: 0 },
    { name: 'Livraison Dakar', price: 2000 },
    { name: 'Livraison banlieue (Pikine, Guédiawaye, Rufisque…)', price: 3000 },
    { name: 'Envoi régions (prix confirmé par téléphone)', price: 0 }
  ],
  payments: ['Wave', 'Orange Money', 'Espèces à la livraison / en boutique']
};

const DEFAULT_PRODUCTS = [
  { texture: 't-bazin', category: 'Bazin riche', name: 'Bazin Émeraude Royal', size: 'Pièce de 5 mètres', price: 35000, stock: 5 },
  { texture: 't-getzner', category: 'Getzner', name: 'Getzner Or Impérial', size: 'Pièce de 5 mètres', price: 60000, stock: 5 },
  { texture: 't-dentelle', category: 'Dentelle', name: 'Dentelle Ivoire', size: 'Pièce de 5 mètres', price: 45000, stock: 5 },
  { texture: 't-wax', category: 'Wax', name: 'Wax Émeraude & Ocre', size: 'Pièce de 6 yards', price: 18000, stock: 5 },
  { texture: 't-brocart', category: 'Brocart', name: 'Brocart Nuit Dorée', size: 'Pièce de 5 mètres', price: 30000, stock: 5 },
  { texture: 't-bordeaux', category: 'Getzner', name: 'Getzner Bordeaux', size: 'Pièce de 5 mètres', price: 60000, stock: 5 }
];

// Les nombres SQLite arrivent parfois en BigInt : on renvoie des objets simples.
const plain = (row) => (row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])) : row);

async function all(sql, args = [], conn = db) {
  return (await conn.execute({ sql, args })).rows.map(plain);
}
async function get(sql, args = [], conn = db) {
  return (await all(sql, args, conn))[0];
}
async function run(sql, args = [], conn = db) {
  const r = await conn.execute({ sql, args });
  return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
}

// fn reçoit la connexion de la transaction ; tout est annulé en cas d'erreur.
async function transaction(fn) {
  const tx = await db.transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}

async function getSetting(key, fallback) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : fallback;
}

async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
}

async function getSite() {
  // Fusionne avec les valeurs par défaut pour qu'un nouveau champ ait toujours une valeur.
  const saved = await getSetting('site', {});
  const site = { ...DEFAULT_SITE, ...saved };
  for (const k of ['house', 'founder', 'contact']) site[k] = { ...DEFAULT_SITE[k], ...(saved[k] || {}) };
  return site;
}

async function init() {
  await db.executeMultiple(SCHEMA);
  // INSERT OR IGNORE : si deux démarrages ont lieu en même temps, un seul ajoute les exemples.
  const { changes } = await run("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', 'true')");
  if (changes) {
    await db.batch(DEFAULT_PRODUCTS.map((p, i) => ({
      sql: 'INSERT INTO products (name, category, size, price, stock, texture, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [p.name, p.category, p.size, p.price, p.stock, p.texture, i]
    })), 'write');
  }
}

let ready;
const ensureReady = () => (ready ||= init().catch((err) => { ready = null; throw err; }));

module.exports = { db, all, get, run, transaction, getSetting, setSetting, getSite, ensureReady, UPLOAD_DIR, DEFAULT_SITE };
