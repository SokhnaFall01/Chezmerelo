'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = (n) => Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
const STATUTS = ['nouvelle', 'confirmée', 'payée', 'livrée', 'annulée'];
const TEXTURES = ['t-bazin', 't-getzner', 't-dentelle', 't-wax', 't-brocart', 't-bordeaux'];

const S = { products: [], orders: [], site: null, onglet: 'commandes', filtreCmd: 'en cours', rechProd: '', catProd: 'Toutes', modifie: false };

// ---------- Outils ----------
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('/login')) { afficherConnexion(); throw new Error('Session expirée, reconnectez-vous.'); }
  if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
  return j;
}

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = 'toast'), 2600);
}

const date = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function waNumero(tel) {
  let d = String(tel).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9) d = '221' + d; // numéro sénégalais sans indicatif
  return d;
}

// Réduit les photos du téléphone (souvent 4–8 Mo) avant l'envoi : le site reste rapide.
async function reduire(file, max = 1800) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

async function envoyerPhoto(file) {
  const fd = new FormData();
  fd.append('photo', await reduire(file));
  return (await api('POST', '/api/admin/upload', fd)).url;
}

function choisirPhotos(multiple) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = !!multiple;
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}

const lire = (obj, chemin) => chemin.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function ecrire(obj, chemin, val) {
  const ks = chemin.split('.');
  const dernier = ks.pop();
  ks.reduce((o, k) => o[k], obj)[dernier] = val;
}

const apercu = (url, vide = 'Aucune photo', cls = '') =>
  `<div class="apercu ${cls}">${url ? `<img src="${esc(url)}" alt="">` : esc(vide)}</div>`;

// ---------- Connexion ----------
function afficherConnexion() {
  $('app').hidden = true;
  $('connexion').hidden = false;
}

$('form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erreur-connexion').textContent = '';
  try {
    await api('POST', '/api/admin/login', { password: e.target.password.value });
    e.target.reset();
    await demarrer();
  } catch (err) {
    $('erreur-connexion').textContent = err.message;
  }
});

async function charger() {
  const [products, orders, site] = await Promise.all([
    api('GET', '/api/admin/products'), api('GET', '/api/admin/orders'), api('GET', '/api/admin/site')
  ]);
  Object.assign(S, { products, orders, site, modifie: false });
}

async function demarrer() {
  await charger();
  $('connexion').hidden = true;
  $('app').hidden = false;
  rendre();
}

// ---------- Navigation ----------
$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-onglet]');
  if (!b) return;
  S.onglet = b.dataset.onglet;
  document.querySelectorAll('#onglets button').forEach((x) => x.classList.toggle('on', x === b));
  rendre();
  window.scrollTo(0, 0);
});

function majBadge() {
  const n = S.orders.filter((o) => o.status === 'nouvelle').length;
  $('badge-commandes').hidden = !n;
  $('badge-commandes').textContent = n;
}

function rendre() {
  majBadge();
  ({ commandes: rendreCommandes, produits: rendreProduits, accueil: rendreAccueil, infos: rendreInfos, compte: rendreCompte })[S.onglet]();
  barreEnregistrer();
}

// ---------- Commandes ----------
function rendreCommandes() {
  const maintenant = new Date();
  const duMois = S.orders.filter((o) => {
    const d = new Date(o.created_at.replace(' ', 'T') + 'Z');
    return o.status !== 'annulée' && d.getMonth() === maintenant.getMonth() && d.getFullYear() === maintenant.getFullYear();
  });
  const epuises = S.products.filter((p) => p.visible && p.stock === 0).length;
  const filtres = { 'en cours': ['nouvelle', 'confirmée', 'payée'], toutes: STATUTS };
  STATUTS.forEach((s) => (filtres[s] = [s]));
  const liste = S.orders.filter((o) => filtres[S.filtreCmd].includes(o.status));

  $('contenu').innerHTML = `
    <div class="titre-section"><div><h2>Commandes</h2><p class="aide">Les commandes passées sur le site arrivent ici. Le stock est déduit automatiquement ; une commande annulée remet les pièces en stock.</p></div>
      <button class="btn clair" data-action="actualiser">↻ Actualiser</button></div>
    <div class="stats">
      <div class="stat"><span>Nouvelles commandes</span><b>${S.orders.filter((o) => o.status === 'nouvelle').length}</b></div>
      <div class="stat"><span>Commandes ce mois-ci</span><b>${duMois.length}</b></div>
      <div class="stat"><span>Chiffre d'affaires du mois</span><b>${fcfa(duMois.reduce((s, o) => s + o.total, 0))}</b></div>
      <div class="stat ${epuises ? 'alerte' : ''}"><span>Produits épuisés</span><b>${epuises}</b></div>
    </div>
    <div class="puces">${Object.keys(filtres).map((f) => `<button data-filtre-cmd="${f}" class="${f === S.filtreCmd ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)} (${S.orders.filter((o) => filtres[f].includes(o.status)).length})</button>`).join('')}</div>
    ${liste.length ? liste.map(carteCommande).join('') : '<div class="vide">Aucune commande ici pour le moment.</div>'}`;
}

function carteCommande(o) {
  const tel = waNumero(o.phone);
  const msg = `Bonjour ${o.name}, c'est Chez Mère Lo. Nous avons bien reçu votre commande n°${o.id} (${fcfa(o.total)}).`;
  return `<article class="commande ${o.status === 'nouvelle' ? 'nouvelle' : ''}">
    <div class="cmd-tete"><div><h3>Commande n°${o.id}</h3><small>${date(o.created_at)}</small></div><span class="statut s-${o.status}">${o.status}</span></div>
    <div class="cmd-infos">
      <div><span>Cliente :</span> <strong>${esc(o.name)}</strong></div>
      <div><span>Téléphone :</span> <a href="tel:+${tel}">${esc(o.phone)}</a></div>
      <div><span>Livraison :</span> ${esc(o.zone)}</div>
      <div><span>Paiement :</span> ${esc(o.payment)}</div>
      ${o.address ? `<div class="large"><span>Adresse :</span> ${esc(o.address)}</div>` : ''}
      ${o.note ? `<div class="large"><span>Message :</span> ${esc(o.note)}</div>` : ''}
    </div>
    <div class="cmd-articles">
      ${o.items.map((i) => `<div><span>${i.qty} × ${esc(i.name)}</span><span>${fcfa(i.price * i.qty)}</span></div>`).join('')}
      <div><span>Livraison</span><span>${o.delivery ? fcfa(o.delivery) : '—'}</span></div>
      <div class="total"><span>Total</span><span>${fcfa(o.total)}</span></div>
    </div>
    <div class="cmd-actions">
      <label style="flex-direction:row;align-items:center;gap:8px">Statut
        <select data-statut="${o.id}" style="width:auto">${STATUTS.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <a class="btn or petit" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}">Répondre sur WhatsApp</a>
    </div>
  </article>`;
}

// ---------- Produits ----------
function rendreProduits() {
  const cats = ['Toutes', ...new Set([...S.site.categories, ...S.products.map((p) => p.category)])];
  const q = S.rechProd.toLowerCase();
  const liste = S.products.filter((p) => (S.catProd === 'Toutes' || p.category === S.catProd) && (!q || p.name.toLowerCase().includes(q)));
  const filtre = q || S.catProd !== 'Toutes';
  $('contenu').innerHTML = `
    <div class="titre-section"><div><h2>Produits &amp; stock</h2><p class="aide">Ajoutez les nouveaux tissus, ajustez le stock avec − / +, masquez un produit sans le supprimer.</p></div>
      <button class="btn or" data-action="nouveau-produit">+ Nouveau produit</button></div>
    <div class="puces">${cats.map((c) => `<button data-cat-prod="${esc(c)}" class="${c === S.catProd ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
    <p><input class="recherche" type="search" id="rech-prod" placeholder="Rechercher un produit…" value="${esc(S.rechProd)}"></p>
    <div class="produits">${liste.length ? liste.map((p) => carteProduit(p, filtre)).join('') : '<div class="vide">Aucun produit. Cliquez sur « Nouveau produit » pour en ajouter un.</div>'}</div>`;
}

function carteProduit(p, filtre) {
  const i = S.products.indexOf(p);
  const etat = p.stock === 0 ? 'zero' : p.stock <= 2 ? 'bas' : '';
  return `<div class="prod ${p.visible ? '' : 'cache'}">
    <div class="vignette">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div>
    <div>
      <h3>${esc(p.name)}</h3>
      <div class="meta">${esc(p.category)}${p.size ? ' · ' + esc(p.size) : ''}</div>
      <div class="prix">${fcfa(p.price)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
        ${p.stock === 0 ? '<span class="etiquette">Épuisé</span>' : p.stock <= 2 ? '<span class="etiquette orange">Stock bas</span>' : ''}
        ${p.visible ? '' : '<span class="etiquette gris">Masqué</span>'}
        ${p.image ? '' : '<span class="etiquette gris">Sans photo</span>'}
      </div>
    </div>
    <div class="prod-droite">
      <div class="stock ${etat}" title="Pièces en stock">
        <button class="icone" data-stock="${p.id}" data-delta="-1" ${p.stock ? '' : 'disabled'} aria-label="Retirer une pièce">−</button>
        <b>${p.stock}</b>
        <button class="icone" data-stock="${p.id}" data-delta="1" aria-label="Ajouter une pièce">+</button>
      </div>
      <div class="prod-actions">
        ${filtre ? '' : `<button class="icone" data-ordre="${i}" data-sens="-1" ${i ? '' : 'disabled'} aria-label="Monter">↑</button>
        <button class="icone" data-ordre="${i}" data-sens="1" ${i < S.products.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button>`}
        <button class="btn clair petit" data-visible="${p.id}">${p.visible ? 'Masquer' : 'Afficher'}</button>
        <button class="btn petit" data-modifier="${p.id}">Modifier</button>
      </div>
    </div>
  </div>`;
}

function ouvrirEditeur(p) {
  const neuf = !p;
  p = p || { name: '', category: S.catProd !== 'Toutes' ? S.catProd : S.site.categories[0] || '', size: '', price: '', stock: 1, description: '', image: '', visible: 1 };
  let image = p.image;
  const d = $('editeur');
  d.innerHTML = `<form method="dialog" id="form-produit">
    <div class="editeur-tete"><h2>${neuf ? 'Nouveau produit' : 'Modifier le produit'}</h2><button type="button" class="icone" data-fermer aria-label="Fermer">×</button></div>
    <div class="editeur-corps">
      <div class="photo" style="width:100%">
        <div id="apercu-produit">${apercu(image, 'Ajoutez une photo du tissu')}</div>
        <button type="button" class="btn clair petit" data-photo-produit>${image ? 'Changer la photo' : 'Ajouter une photo'}</button>
        ${image ? '<button type="button" class="btn danger petit" data-ote-photo-produit>Retirer la photo</button>' : ''}
      </div>
      <div class="champs">
        <label class="large">Nom du produit<input name="name" required value="${esc(p.name)}" placeholder="ex. Bazin riche bleu nuit"></label>
        <label>Catégorie<input name="category" required list="liste-cats" value="${esc(p.category)}"></label>
        <label>Métrage / taille<input name="size" value="${esc(p.size)}" placeholder="ex. Pièce de 5 mètres"></label>
        <label>Prix (FCFA)<input name="price" type="number" min="0" step="500" inputmode="numeric" required value="${esc(p.price)}"></label>
        <label>Pièces en stock<input name="stock" type="number" min="0" inputmode="numeric" required value="${esc(p.stock)}"></label>
        <label class="large">Description<textarea name="description" placeholder="Qualité, couleur, occasion idéale…">${esc(p.description)}</textarea></label>
        <label class="case large"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> Visible sur le site</label>
      </div>
    </div>
    <datalist id="liste-cats">${S.site.categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <p class="erreur" id="erreur-produit"></p>
    <div class="editeur-pied">
      ${neuf ? '<span></span>' : '<button type="button" class="btn danger" data-supprimer-produit>Supprimer</button>'}
      <div style="display:flex;gap:10px"><button type="button" class="btn clair" data-fermer>Annuler</button><button class="btn or" id="enregistrer-produit">Enregistrer</button></div>
    </div>
  </form>`;
  d.showModal();

  const majPhoto = () => {
    $('apercu-produit').innerHTML = apercu(image, 'Ajoutez une photo du tissu');
    d.querySelector('[data-photo-produit]').textContent = image ? 'Changer la photo' : 'Ajouter une photo';
  };
  d.onclick = async (e) => {
    if (e.target.closest('[data-fermer]')) return d.close();
    if (e.target.closest('[data-ote-photo-produit]')) { image = ''; e.target.remove(); return majPhoto(); }
    if (e.target.closest('[data-photo-produit]')) {
      const [f] = await choisirPhotos(false);
      if (!f) return;
      $('apercu-produit').innerHTML = apercu('', 'Envoi de la photo…');
      try { image = await envoyerPhoto(f); } catch (err) { toast(err.message, true); }
      return majPhoto();
    }
    if (e.target.closest('[data-supprimer-produit]')) {
      if (!confirm(`Supprimer définitivement « ${p.name} » ?\nPour le retirer temporairement du site, utilisez plutôt « Masquer ».`)) return;
      await api('DELETE', '/api/admin/products/' + p.id);
      S.products = S.products.filter((x) => x.id !== p.id);
      d.close(); rendre(); toast('Produit supprimé');
    }
  };
  $('form-produit').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const corps = {
      name: f.name.value, category: f.category.value, size: f.size.value, price: f.price.value,
      stock: f.stock.value, description: f.description.value, visible: f.visible.checked, image
    };
    $('enregistrer-produit').disabled = true;
    try {
      const r = neuf ? await api('POST', '/api/admin/products', corps) : await api('PUT', '/api/admin/products/' + p.id, corps);
      if (neuf) S.products.push(r); else S.products[S.products.findIndex((x) => x.id === r.id)] = r;
      d.close(); rendre(); toast(neuf ? 'Produit ajouté' : 'Produit enregistré');
    } catch (err) {
      $('erreur-produit').textContent = err.message;
      $('enregistrer-produit').disabled = false;
    }
  };
}

// ---------- Page d'accueil ----------
function champ(label, chemin, type = 'text', extra = '') {
  const v = lire(S.site, chemin) ?? '';
  if (type === 'textarea') return `<label class="${extra}">${label}<textarea data-lien="${chemin}">${esc(v)}</textarea></label>`;
  return `<label class="${extra}">${label}<input type="${type}" data-lien="${chemin}" value="${esc(v)}"></label>`;
}

function outils(liste, i, n, nom) {
  return `<div class="element-outils"><span>${nom} ${i + 1}</span><div>
    <button class="icone" data-monter="${liste}" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Monter">↑</button>
    <button class="icone" data-descendre="${liste}" data-i="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button>
    <button class="icone" data-suppr="${liste}" data-i="${i}" aria-label="Supprimer">🗑</button></div></div>`;
}

function blocPhoto(chemin, vide, cls = '', apercuCls = '') {
  const url = lire(S.site, chemin);
  return `<div class="photo ${cls}">${apercu(url, vide, apercuCls)}
    <button class="btn clair petit" data-photo="${chemin}">${url ? 'Changer' : 'Ajouter une photo'}</button>
    ${url ? `<button class="btn danger petit" data-ote="${chemin}">Retirer</button>` : ''}</div>`;
}

function rendreAccueil() {
  const s = S.site;
  $('contenu').innerHTML = `
    <div class="titre-section"><div><h2>Page d'accueil</h2><p class="aide">Modifiez les photos et les textes, puis cliquez sur « Enregistrer » en bas de l'écran.</p></div></div>

    <section class="bloc"><h3>Diaporama d'ouverture</h3>
      <p class="aide">Les grandes images qui défilent en haut du site. Photos horizontales de préférence. Sans photo, un motif de tissu est affiché.</p>
      <div class="liste">${s.hero.map((h, i) => `<div class="element">
        ${blocPhoto(`hero.${i}.image`, 'Motif ' + (h.texture || 'tissu').replace('t-', ''), '', 'large')}
        <div class="champs">
          ${champ('Petit titre (doré)', `hero.${i}.kicker`)}
          ${champ('Titre', `hero.${i}.title`)}
          ${champ('Suite du titre (en italique doré)', `hero.${i}.titleEm`)}
          ${champ('Texte', `hero.${i}.text`, 'textarea', 'large')}
        </div>${outils('hero', i, s.hero.length, 'Diapositive')}</div>`).join('')}</div>
      <p><button class="btn clair" data-ajouter="hero">+ Ajouter une diapositive</button></p>
    </section>

    <section class="bloc"><h3>La fondatrice</h3>
      <p class="aide">Mettez ici la photo de Khadidiatou Fall — portrait vertical de préférence.</p>
      <div class="element">
        ${blocPhoto('founder.photo', 'Photo de la fondatrice', 'portrait-f')}
        <div class="champs">
          ${champ('Nom', 'founder.name', 'text', 'large')}
          ${champ('Citation', 'founder.quote', 'textarea', 'large')}
          ${champ('Son histoire (laissez une ligne vide entre deux paragraphes)', 'founder.bio', 'textarea', 'large')}
        </div>
      </div>
    </section>

    <section class="bloc"><h3>Galerie photos</h3>
      <p class="aide">La boutique, les clientes en tenue, les cérémonies, les arrivages… La section apparaît sur le site dès qu'il y a une photo.</p>
      <div class="galerie-admin">${s.gallery.map((g, i) => `<div class="element">
        ${apercu(g.image)}
        <input data-lien="gallery.${i}.caption" value="${esc(g.caption)}" placeholder="Légende (facultatif)">
        ${outils('gallery', i, s.gallery.length, 'Photo')}</div>`).join('')}</div>
      <p><button class="btn clair" data-action="ajouter-galerie">+ Ajouter des photos</button></p>
    </section>

    <section class="bloc"><h3>La maison</h3>
      <div class="champs">
        ${champ('Titre', 'house.title')}
        ${champ('Suite du titre (en italique doré)', 'house.titleEm')}
        ${champ('Texte (laissez une ligne vide entre deux paragraphes)', 'house.text', 'textarea', 'large')}
      </div>
    </section>

    <section class="bloc"><h3>Services</h3>
      <div class="liste">${s.services.map((v, i) => `<div class="element sans-photo"><div class="champs">
        ${champ('Titre', `services.${i}.title`)}${champ('Texte', `services.${i}.text`, 'textarea', 'large')}</div>
        ${outils('services', i, s.services.length, 'Service')}</div>`).join('')}</div>
      <p><button class="btn clair" data-ajouter="services">+ Ajouter un service</button></p>
    </section>`;
}

// ---------- Infos & livraison ----------
function rendreInfos() {
  const s = S.site;
  $('contenu').innerHTML = `
    <div class="titre-section"><div><h2>Infos &amp; livraison</h2><p class="aide">Coordonnées, horaires, zones de livraison et moyens de paiement affichés sur le site.</p></div></div>
    <section class="bloc"><h3>Coordonnées</h3><div class="champs">
      ${champ('Adresse', 'contact.address', 'text', 'large')}
      ${champ('Téléphone principal', 'contact.phone', 'tel')}
      ${champ('Numéro WhatsApp qui reçoit les commandes (avec 221)', 'contact.whatsapp', 'tel')}
      ${champ('Nom du 2e contact', 'contact.phone2Label')}
      ${champ('Téléphone du 2e contact', 'contact.phone2', 'tel')}
      ${champ("Horaires d'ouverture", 'contact.hours', 'textarea', 'large')}
      ${champ('Lien Google Maps', 'contact.mapsUrl', 'url', 'large')}
      ${champ('Lien TikTok', 'contact.tiktok', 'url')}
      ${champ('Lien Facebook', 'contact.facebook', 'url')}
      ${champ('Lien Instagram', 'contact.instagram', 'url')}
    </div></section>

    <section class="bloc"><h3>Zones de livraison</h3>
      <p class="aide">La cliente choisit sa zone au moment de commander ; le prix s'ajoute au total. Mettez 0 pour gratuit ou « à confirmer ».</p>
      <div class="liste">${s.delivery.map((z, i) => `<div class="element sans-photo"><div class="champs">
        ${champ('Zone', `delivery.${i}.name`)}${champ('Prix (FCFA)', `delivery.${i}.price`, 'number')}</div>
        ${outils('delivery', i, s.delivery.length, 'Zone')}</div>`).join('')}</div>
      <p><button class="btn clair" data-ajouter="delivery">+ Ajouter une zone</button></p>
    </section>

    <section class="bloc"><h3>Moyens de paiement</h3><p class="aide">Un par ligne.</p>
      <textarea data-lignes="payments">${esc(s.payments.join('\n'))}</textarea></section>

    <section class="bloc"><h3>Catégories de tissus</h3><p class="aide">Une par ligne, dans l'ordre d'affichage des filtres de la boutique.</p>
      <textarea data-lignes="categories">${esc(s.categories.join('\n'))}</textarea></section>`;
}

// ---------- Compte ----------
function rendreCompte() {
  $('contenu').innerHTML = `
    <div class="titre-section"><h2>Compte</h2></div>
    <section class="bloc"><h3>Changer le mot de passe</h3>
      <form id="form-mdp" class="champs" style="max-width:520px">
        <label class="large">Mot de passe actuel<input type="password" name="current" autocomplete="current-password" required></label>
        <label class="large">Nouveau mot de passe (8 caractères minimum)<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <p class="erreur large" id="erreur-mdp"></p>
        <div><button class="btn">Changer le mot de passe</button></div>
      </form>
    </section>
    <section class="bloc"><h3>Déconnexion</h3><p class="aide">Sur un téléphone partagé, pensez à vous déconnecter.</p>
      <button class="btn clair" data-action="deconnexion">Se déconnecter</button></section>`;
  $('form-mdp').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/admin/password', { current: e.target.current.value, next: e.target.next.value });
      e.target.reset(); toast('Mot de passe changé');
    } catch (err) { $('erreur-mdp').textContent = err.message; }
  };
}

// ---------- Enregistrement du contenu du site ----------
function barreEnregistrer() {
  let b = $('barre-enregistrer');
  if (!b) {
    b = document.createElement('div');
    b.id = 'barre-enregistrer';
    b.className = 'enregistrer';
    b.innerHTML = '<span>Modifications non enregistrées</span><button class="btn clair petit" data-action="annuler" style="color:#F4EEE3">Annuler</button><button class="btn or" data-action="enregistrer">Enregistrer</button>';
    document.body.appendChild(b);
    b.addEventListener('click', clic);
  }
  b.classList.toggle('on', S.modifie);
}
function modifie() { S.modifie = true; barreEnregistrer(); }

window.addEventListener('beforeunload', (e) => { if (S.modifie) e.preventDefault(); });

// ---------- Évènements ----------
$('contenu').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'rech-prod') {
    S.rechProd = t.value;
    const pos = t.selectionStart;
    rendre();
    const n = $('rech-prod'); n.focus(); n.setSelectionRange(pos, pos);
    return;
  }
  if (t.dataset.lien) {
    ecrire(S.site, t.dataset.lien, t.type === 'number' ? Number(t.value) || 0 : t.value);
    modifie();
  } else if (t.dataset.lignes) {
    S.site[t.dataset.lignes] = t.value.split('\n').map((x) => x.trim()).filter(Boolean);
    modifie();
  }
});

$('contenu').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-statut]');
  if (!sel) return;
  const id = +sel.dataset.statut;
  try {
    const o = await api('PATCH', '/api/admin/orders/' + id, { status: sel.value });
    Object.assign(S.orders.find((x) => x.id === id), o);
    S.products = await api('GET', '/api/admin/products');
    rendre(); toast(`Commande n°${id} : ${o.status}`);
  } catch (err) { toast(err.message, true); rendre(); }
});

$('contenu').addEventListener('click', clic);

async function clic(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  try {
    if (d.action === 'actualiser') { S.orders = await api('GET', '/api/admin/orders'); S.products = await api('GET', '/api/admin/products'); rendre(); toast('À jour'); }
    else if (d.action === 'nouveau-produit') ouvrirEditeur(null);
    else if (d.action === 'deconnexion') { await api('POST', '/api/admin/logout'); afficherConnexion(); }
    else if (d.action === 'enregistrer') {
      t.disabled = true;
      S.site = await api('PUT', '/api/admin/site', S.site);
      S.modifie = false; t.disabled = false; rendre(); toast('Site mis à jour ✓');
    }
    else if (d.action === 'annuler') { S.site = await api('GET', '/api/admin/site'); S.modifie = false; rendre(); }
    else if (d.action === 'ajouter-galerie') {
      const fichiers = await choisirPhotos(true);
      for (const [k, f] of fichiers.entries()) {
        toast(`Envoi de la photo ${k + 1} / ${fichiers.length}…`);
        S.site.gallery.push({ image: await envoyerPhoto(f), caption: '' });
      }
      if (fichiers.length) { modifie(); rendre(); toast('Photos ajoutées — pensez à enregistrer'); }
    }
    else if (d.filtreCmd) { S.filtreCmd = d.filtreCmd; rendre(); }
    else if (d.catProd) { S.catProd = d.catProd; rendre(); }
    else if (d.modifier) ouvrirEditeur(S.products.find((p) => p.id === +d.modifier));
    else if (d.stock) {
      const p = await api('PATCH', `/api/admin/products/${d.stock}/stock`, { delta: +d.delta });
      S.products[S.products.findIndex((x) => x.id === p.id)] = p; rendre();
    }
    else if (d.visible) {
      const cur = S.products.find((p) => p.id === +d.visible);
      const p = await api('PATCH', `/api/admin/products/${d.visible}/visible`, { visible: !cur.visible });
      S.products[S.products.indexOf(cur)] = p; rendre(); toast(p.visible ? 'Produit affiché sur le site' : 'Produit masqué du site');
    }
    else if (d.ordre) {
      const i = +d.ordre, j = i + +d.sens;
      [S.products[i], S.products[j]] = [S.products[j], S.products[i]];
      rendre();
      await api('POST', '/api/admin/products/order', { ids: S.products.map((p) => p.id) });
    }
    else if (d.photo) {
      const [f] = await choisirPhotos(false);
      if (!f) return;
      toast('Envoi de la photo…');
      ecrire(S.site, d.photo, await envoyerPhoto(f));
      modifie(); rendre(); toast('Photo ajoutée — pensez à enregistrer');
    }
    else if (d.ote) { ecrire(S.site, d.ote, ''); modifie(); rendre(); }
    else if (d.monter || d.descendre) {
      const l = S.site[d.monter || d.descendre], i = +d.i, j = d.monter ? i - 1 : i + 1;
      [l[i], l[j]] = [l[j], l[i]]; modifie(); rendre();
    }
    else if (d.suppr) {
      if (d.suppr === 'hero' && S.site.hero.length === 1) return toast('Il faut garder au moins une diapositive', true);
      if (!confirm('Supprimer cet élément ?')) return;
      S.site[d.suppr].splice(+d.i, 1); modifie(); rendre();
    }
    else if (d.ajouter) {
      const vides = {
        hero: { image: '', texture: TEXTURES[S.site.hero.length % TEXTURES.length], kicker: '', title: '', titleEm: '', text: '' },
        services: { title: '', text: '' },
        delivery: { name: '', price: 0 }
      };
      S.site[d.ajouter].push(vides[d.ajouter]); modifie(); rendre();
    }
  } catch (err) {
    toast(err.message, true);
    t.disabled = false;
  }
}

// Vérifie les nouvelles commandes chaque minute.
setInterval(async () => {
  if ($('app').hidden || document.hidden) return;
  try {
    const avant = S.orders.length;
    const orders = await api('GET', '/api/admin/orders');
    if (orders.length !== avant || orders.some((o, i) => o.status !== S.orders[i]?.status)) {
      S.orders = orders;
      if (orders.length > avant) toast('Nouvelle commande reçue !');
      if (S.onglet === 'commandes') rendre(); else majBadge();
    }
  } catch { /* réessaie à la prochaine minute */ }
}, 60e3);

api('GET', '/api/admin/me').then((r) => (r.admin ? demarrer() : afficherConnexion())).catch(afficherConnexion);
