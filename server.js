const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { db, UPLOAD_DIR, getSite, setSetting, transaction } = require('./src/db');
const auth = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const STATUSES = ['nouvelle', 'confirmée', 'payée', 'livrée', 'annulée'];

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ---------- Utilitaires ----------
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, min = 0, max = 1e9) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const imageUrl = (v) => {
  const s = str(v, 300);
  return /^\/uploads\/[\w.-]+$/.test(s) ? s : '';
};

// Limiteur très simple, en mémoire, par adresse IP.
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip) || { n: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
    entry.n++;
    hits.set(req.ip, entry);
    if (entry.n > max) return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard.' });
    next();
  };
}

function publicProducts() {
  return db.prepare(`SELECT id, name, category, description, size, price, stock, image, texture
                     FROM products WHERE visible = 1 ORDER BY sort, id`).all();
}

// ---------- Site public ----------
const template = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

function renderHome(req, res) {
  const data = { site: getSite(), products: publicProducts() };
  // Échappe « < » pour que le JSON ne puisse pas fermer la balise <script>.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  res.type('html').send(template.replace('/*__DATA__*/null', () => json));
}
app.get('/', renderHome);
app.get('/index.html', renderHome);

app.get('/api/public', (req, res) => res.json({ site: getSite(), products: publicProducts() }));

app.post('/api/orders', limiter(15, 60 * 60e3), (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const phone = str(b.phone, 40);
  if (!name || phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'Merci d\'indiquer votre nom et un numéro de téléphone valide.' });
  }
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) return res.status(400).json({ error: 'Votre panier est vide.' });

  const site = getSite();
  const zone = site.delivery.find((z) => z.name === b.zone) || site.delivery[0] || { name: '', price: 0 };
  const payment = site.payments.includes(b.payment) ? b.payment : (site.payments[0] || '');

  try {
    const order = transaction(() => {
      const getProduct = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ? AND visible = 1');
      const lines = [];
      for (const it of items) {
        const qty = int(it.qty, 1, 99);
        const p = getProduct.get(int(it.id));
        if (!p) throw new UserError('Un article de votre panier n\'est plus disponible.');
        if (p.stock < qty) {
          throw new UserError(p.stock === 0 ? `« ${p.name} » est épuisé.` : `Il ne reste que ${p.stock} pièce(s) de « ${p.name} ».`);
        }
        lines.push({ ...p, qty });
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const total = subtotal + int(zone.price);
      const { lastInsertRowid: id } = db.prepare(
        `INSERT INTO orders (name, phone, address, zone, delivery, payment, note, subtotal, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(name, phone, str(b.address, 300), zone.name, int(zone.price), payment, str(b.note, 1000), subtotal, total);
      const addItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)');
      const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const l of lines) {
        addItem.run(id, l.id, l.name, l.price, l.qty);
        decStock.run(l.qty, l.id);
      }
      return { id: Number(id), subtotal, total, delivery: int(zone.price), zone: zone.name, payment, lines: lines.map(({ name, price, qty }) => ({ name, price, qty })) };
    });
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof UserError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

class UserError extends Error {}

// ---------- Admin : connexion ----------
app.post('/api/admin/login', limiter(10, 15 * 60e3), (req, res) => {
  if (!auth.checkPassword(req.body?.password)) return res.status(401).json({ error: 'Mot de passe incorrect' });
  auth.login(req, res);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { auth.logout(req, res); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: auth.isAdmin(req) }));

const admin = express.Router();
admin.use(auth.requireAdmin);

admin.post('/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.checkPassword(current)) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  auth.setPassword(String(next));
  auth.login(req, res);
  res.json({ ok: true });
});

// ---------- Admin : photos ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});
admin.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Format accepté : JPG, PNG ou WebP (10 Mo max).' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---------- Admin : produits & stock ----------
function productFields(b) {
  return {
    name: str(b.name, 120),
    category: str(b.category, 60),
    description: str(b.description, 2000),
    size: str(b.size, 120),
    price: int(b.price),
    stock: int(b.stock, 0, 100000),
    image: imageUrl(b.image),
    visible: b.visible === false || b.visible === 0 ? 0 : 1
  };
}

admin.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY sort, id').all());
});

admin.post('/products', (req, res) => {
  const p = productFields(req.body || {});
  if (!p.name || !p.category) return res.status(400).json({ error: 'Nom et catégorie obligatoires' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM products').get().s;
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO products (name, category, description, size, price, stock, image, visible, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.name, p.category, p.description, p.size, p.price, p.stock, p.image, p.visible, sort);
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(lastInsertRowid));
});

admin.put('/products/:id', (req, res) => {
  const p = productFields(req.body || {});
  if (!p.name || !p.category) return res.status(400).json({ error: 'Nom et catégorie obligatoires' });
  const r = db.prepare(
    `UPDATE products SET name = ?, category = ?, description = ?, size = ?, price = ?, stock = ?, image = ?, visible = ?
     WHERE id = ?`
  ).run(p.name, p.category, p.description, p.size, p.price, p.stock, p.image, p.visible, int(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(int(req.params.id)));
});

admin.patch('/products/:id/stock', (req, res) => {
  const id = int(req.params.id);
  db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(int(req.body?.delta, -100000, 100000), id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

admin.patch('/products/:id/visible', (req, res) => {
  const id = int(req.params.id);
  db.prepare('UPDATE products SET visible = ? WHERE id = ?').run(req.body?.visible ? 1 : 0, id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

admin.post('/products/order', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => int(x)) : [];
  const upd = db.prepare('UPDATE products SET sort = ? WHERE id = ?');
  transaction(() => ids.forEach((id, i) => upd.run(i, id)));
  res.json({ ok: true });
});

admin.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
});

// ---------- Admin : commandes ----------
admin.get('/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: items.all(o.id) })));
});

admin.patch('/orders/:id', (req, res) => {
  const id = int(req.params.id);
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut inconnu' });
  const updated = transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return null;
    // Annuler une commande remet les pièces en stock ; la réactiver les retire à nouveau.
    const wasCancelled = order.status === 'annulée';
    const isCancelled = status === 'annulée';
    if (wasCancelled !== isCancelled) {
      const sign = isCancelled ? 1 : -1;
      const upd = db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?');
      for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id)) {
        if (it.product_id) upd.run(sign * it.qty, it.product_id);
      }
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  });
  if (!updated) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(updated);
});

// ---------- Admin : contenu de la page d'accueil ----------
admin.get('/site', (req, res) => res.json(getSite()));

admin.put('/site', (req, res) => {
  const b = req.body || {};
  const cur = getSite();
  const list = (v, max, map) => (Array.isArray(v) ? v.slice(0, max).map(map) : []);
  const site = {
    hero: list(b.hero, 8, (s) => ({
      image: imageUrl(s.image), texture: str(s.texture, 30), kicker: str(s.kicker, 60),
      title: str(s.title, 80), titleEm: str(s.titleEm, 80), text: str(s.text, 300)
    })),
    house: { title: str(b.house?.title, 120), titleEm: str(b.house?.titleEm, 120), text: str(b.house?.text, 3000) },
    founder: {
      photo: imageUrl(b.founder?.photo), name: str(b.founder?.name, 120),
      quote: str(b.founder?.quote, 500), bio: str(b.founder?.bio, 4000)
    },
    gallery: list(b.gallery, 40, (g) => ({ image: imageUrl(g.image), caption: str(g.caption, 160) })).filter((g) => g.image),
    services: list(b.services, 8, (s) => ({ title: str(s.title, 80), text: str(s.text, 400) })).filter((s) => s.title),
    categories: list(b.categories, 30, (c) => str(c, 60)).filter(Boolean),
    contact: Object.fromEntries(Object.keys(cur.contact).map((k) => [k, str(b.contact?.[k], 300)])),
    delivery: list(b.delivery, 20, (z) => ({ name: str(z.name, 120), price: int(z.price) })).filter((z) => z.name),
    payments: list(b.payments, 10, (p) => str(p, 80)).filter(Boolean)
  };
  if (!site.hero.length) site.hero = cur.hero;
  site.contact.whatsapp = site.contact.whatsapp.replace(/\D/g, '');
  setSetting('site', site);
  res.json(site);
});

app.use('/api/admin', admin);

// ---------- Fichiers statiques ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(PUBLIC, { index: false }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(PORT, () => {
  auth.storedHash();
  console.log(`Chez Mère Lo en ligne sur http://localhost:${PORT}  —  admin : http://localhost:${PORT}/admin`);
});
