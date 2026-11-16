const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { all, get, run, transaction, getSite, setSetting, ensureReady, UPLOAD_DIR } = require('./src/db');
const auth = require('./src/auth');

const app = express();
const PUBLIC = path.join(__dirname, 'public');
const STATUSES = ['nouvelle', 'confirmée', 'payée', 'livrée', 'annulée'];
// Sur Vercel, les photos vont dans Vercel Blob ; en local, dans DATA_DIR/uploads.
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/api', async (req, res, next) => { await ensureReady(); next(); });

// ---------- Utilitaires ----------
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, min = 0, max = 1e9) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const imageUrl = (v) => {
  const s = str(v, 400);
  return /^\/uploads\/[\w.-]+$/.test(s) || /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[\w./-]+$/i.test(s) ? s : '';
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

const publicProducts = () => all(`SELECT id, name, category, description, size, price, stock, image, texture
                                  FROM products WHERE visible = 1 ORDER BY sort, id`);
const productById = (id) => get('SELECT * FROM products WHERE id = ?', [id]);

class UserError extends Error {}

// ---------- Site public ----------
// En local, la page d'accueil arrive avec ses données. Sur Vercel, index.html est servi
// tel quel par le CDN et le navigateur charge /api/public.
let template;
async function renderHome(req, res) {
  await ensureReady();
  template ||= fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const data = { site: await getSite(), products: await publicProducts() };
  // Échappe « < » pour que le JSON ne puisse pas fermer la balise <script>.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  res.type('html').send(template.replace('/*__DATA__*/null', () => json));
}
app.get('/', renderHome);
app.get('/index.html', renderHome);

app.get('/api/public', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ site: await getSite(), products: await publicProducts() });
});

app.post('/api/orders', limiter(15, 60 * 60e3), async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  const phone = str(b.phone, 40);
  if (!name || phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'Merci d\'indiquer votre nom et un numéro de téléphone valide.' });
  }
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) return res.status(400).json({ error: 'Votre panier est vide.' });

  const site = await getSite();
  const zone = site.delivery.find((z) => z.name === b.zone) || site.delivery[0] || { name: '', price: 0 };
  const payment = site.payments.includes(b.payment) ? b.payment : (site.payments[0] || '');

  try {
    const order = await transaction(async (tx) => {
      const lines = [];
      for (const it of items) {
        const qty = int(it.qty, 1, 99);
        const p = await get('SELECT id, name, price, stock FROM products WHERE id = ? AND visible = 1', [int(it.id)], tx);
        if (!p) throw new UserError('Un article de votre panier n\'est plus disponible.');
        if (p.stock < qty) {
          throw new UserError(p.stock === 0 ? `« ${p.name} » est épuisé.` : `Il ne reste que ${p.stock} pièce(s) de « ${p.name} ».`);
        }
        lines.push({ ...p, qty });
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const total = subtotal + int(zone.price);
      const { lastInsertRowid: id } = await run(
        `INSERT INTO orders (name, phone, address, zone, delivery, payment, note, subtotal, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, phone, str(b.address, 300), zone.name, int(zone.price), payment, str(b.note, 1000), subtotal, total], tx
      );
      for (const l of lines) {
        await run('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)', [id, l.id, l.name, l.price, l.qty], tx);
        await run('UPDATE products SET stock = stock - ? WHERE id = ?', [l.qty, l.id], tx);
      }
      return { id, subtotal, total, delivery: int(zone.price), zone: zone.name, payment, lines: lines.map(({ name, price, qty }) => ({ name, price, qty })) };
    });
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof UserError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

// ---------- Admin : connexion ----------
app.post('/api/admin/login', limiter(10, 15 * 60e3), async (req, res) => {
  if (!(await auth.checkPassword(req.body?.password))) return res.status(401).json({ error: 'Mot de passe incorrect' });
  await auth.login(req, res);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { auth.logout(req, res); res.json({ ok: true }); });
app.get('/api/admin/me', async (req, res) => res.json({ admin: await auth.isAdmin(req) }));

const admin = express.Router();
admin.use(auth.requireAdmin);
admin.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

admin.post('/password', async (req, res) => {
  const { current, next } = req.body || {};
  if (!(await auth.checkPassword(current))) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  await auth.setPassword(String(next));
  await auth.login(req, res);
  res.json({ ok: true });
});

// ---------- Admin : photos ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
// 4 Mo max : limite des requêtes sur Vercel (les photos sont réduites dans le navigateur avant l'envoi).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype])
});
admin.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Format accepté : JPG, PNG ou WebP (4 Mo max).' });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[req.file.mimetype]}`;
  if (USE_BLOB) {
    const { put } = require('@vercel/blob');
    const blob = await put(`photos/${filename}`, req.file.buffer, { access: 'public', contentType: req.file.mimetype });
    return res.json({ url: blob.url });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  res.json({ url: `/uploads/${filename}` });
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

admin.get('/products', async (req, res) => {
  res.json(await all('SELECT * FROM products ORDER BY sort, id'));
});

admin.post('/products', async (req, res) => {
  const p = productFields(req.body || {});
  if (!p.name || !p.category) return res.status(400).json({ error: 'Nom et catégorie obligatoires' });
  const { s: sort } = await get('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM products');
  const { lastInsertRowid } = await run(
    `INSERT INTO products (name, category, description, size, price, stock, image, visible, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.name, p.category, p.description, p.size, p.price, p.stock, p.image, p.visible, sort]
  );
  res.status(201).json(await productById(lastInsertRowid));
});

admin.put('/products/:id', async (req, res) => {
  const p = productFields(req.body || {});
  if (!p.name || !p.category) return res.status(400).json({ error: 'Nom et catégorie obligatoires' });
  const id = int(req.params.id);
  const r = await run(
    `UPDATE products SET name = ?, category = ?, description = ?, size = ?, price = ?, stock = ?, image = ?, visible = ?
     WHERE id = ?`,
    [p.name, p.category, p.description, p.size, p.price, p.stock, p.image, p.visible, id]
  );
  if (!r.changes) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(await productById(id));
});

admin.patch('/products/:id/stock', async (req, res) => {
  const id = int(req.params.id);
  await run('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?', [int(req.body?.delta, -100000, 100000), id]);
  const p = await productById(id);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json(p);
});

admin.patch('/products/:id/visible', async (req, res) => {
  const id = int(req.params.id);
  await run('UPDATE products SET visible = ? WHERE id = ?', [req.body?.visible ? 1 : 0, id]);
  res.json(await productById(id));
});

admin.post('/products/order', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => int(x)) : [];
  await transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await run('UPDATE products SET sort = ? WHERE id = ?', [i, id], tx);
  });
  res.json({ ok: true });
});

admin.delete('/products/:id', async (req, res) => {
  await run('DELETE FROM products WHERE id = ?', [int(req.params.id)]);
  res.json({ ok: true });
});

// ---------- Admin : commandes ----------
admin.get('/orders', async (req, res) => {
  const orders = await all('SELECT * FROM orders ORDER BY id DESC LIMIT 500');
  const items = orders.length
    ? await all(`SELECT * FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')})`, orders.map((o) => o.id))
    : [];
  res.json(orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })));
});

admin.patch('/orders/:id', async (req, res) => {
  const id = int(req.params.id);
  const status = String(req.body?.status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut inconnu' });
  const updated = await transaction(async (tx) => {
    const order = await get('SELECT * FROM orders WHERE id = ?', [id], tx);
    if (!order) return null;
    // Annuler une commande remet les pièces en stock ; la réactiver les retire à nouveau.
    const wasCancelled = order.status === 'annulée';
    const isCancelled = status === 'annulée';
    if (wasCancelled !== isCancelled) {
      const sign = isCancelled ? 1 : -1;
      for (const it of await all('SELECT * FROM order_items WHERE order_id = ?', [id], tx)) {
        if (it.product_id) await run('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?', [sign * it.qty, it.product_id], tx);
      }
    }
    await run('UPDATE orders SET status = ? WHERE id = ?', [status, id], tx);
    return get('SELECT * FROM orders WHERE id = ?', [id], tx);
  });
  if (!updated) return res.status(404).json({ error: 'Commande introuvable' });
  res.json(updated);
});

// ---------- Admin : contenu de la page d'accueil ----------
admin.get('/site', async (req, res) => res.json(await getSite()));

admin.put('/site', async (req, res) => {
  const b = req.body || {};
  const cur = await getSite();
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
  await setSetting('site', site);
  res.json(site);
});

app.use('/api/admin', admin);

// ---------- Fichiers statiques (en local ; sur Vercel, le CDN sert public/) ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(PUBLIC, { index: false }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  ensureReady().then(() => auth.storedHash()).then(() => {
    app.listen(PORT, () => console.log(`Chez Mère Lo en ligne sur http://localhost:${PORT}  —  admin : http://localhost:${PORT}/admin`));
  });
}
