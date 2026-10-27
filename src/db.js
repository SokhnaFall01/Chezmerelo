const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'chezmerelo.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
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
`);

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

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

function getSite() {
  // Fusionne avec les valeurs par défaut pour qu'un nouveau champ ait toujours une valeur.
  const saved = getSetting('site', {});
  const site = { ...DEFAULT_SITE, ...saved };
  for (const k of ['house', 'founder', 'contact']) site[k] = { ...DEFAULT_SITE[k], ...(saved[k] || {}) };
  return site;
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0 && !getSetting('seeded', false)) {
  const insert = db.prepare('INSERT INTO products (name, category, size, price, stock, texture, sort) VALUES (?, ?, ?, ?, ?, ?, ?)');
  DEFAULT_PRODUCTS.forEach((p, i) => insert.run(p.name, p.category, p.size, p.price, p.stock, p.texture, i));
  setSetting('seeded', true);
}

module.exports = { db, DATA_DIR, UPLOAD_DIR, getSetting, setSetting, getSite, transaction, DEFAULT_SITE };
