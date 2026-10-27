(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fcfa = function (n) { return Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA'; };
  var paras = function (txt) {
    return String(txt || '').split(/\n\s*\n/).filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
  };
  // Photo si elle existe, sinon texture de tissu dessinée en CSS.
  var visuel = function (o, fallback) {
    if (o.image) return '<div class="tex" style="background-image:url(\'' + esc(o.image) + '\')"></div>';
    return '<div class="tex ' + esc(o.texture || fallback || 't-bazin') + '"></div>';
  };

  function start(data) {
    var site = data.site, produits = data.products;
    var c = site.contact;

    // ----- Slider -----
    var hero = site.hero;
    $('slides').innerHTML = hero.map(function (s, k) {
      return '<div class="slide' + (s.image ? ' photo' : '') + (k === 0 ? ' on' : '') + '">' + visuel(s) + '<div class="sheen"></div></div>';
    }).join('');
    $('caps').innerHTML = hero.map(function (s, k) {
      var h = k === 0 ? 'h1' : 'h2';
      return '<div class="cap' + (k === 0 ? ' on' : '') + '"><span class="kicker">' + esc(s.kicker) + '</span>' +
        '<' + h + '>' + esc(s.title) + (s.titleEm ? '<br><em>' + esc(s.titleEm) + '</em>' : '') + '</' + h + '>' +
        (s.text ? '<p>' + esc(s.text) + '</p>' : '') + '</div>';
    }).join('');
    $('dots').innerHTML = hero.map(function (s, k) {
      return '<button class="dot' + (k === 0 ? ' on' : '') + '" aria-label="Diapositive ' + (k + 1) + '"><i></i></button>';
    }).join('');

    var DUREE = 6500;
    var slides = document.querySelectorAll('.slide'), caps = document.querySelectorAll('.cap'), dots = document.querySelectorAll('.dot');
    var i = 0, timer;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function go(n) {
      slides[i].classList.remove('on'); caps[i].classList.remove('on'); dots[i].classList.remove('on');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('on'); caps[i].classList.add('on'); dots[i].classList.add('on');
      $('num').innerHTML = pad(i + 1) + ' <span>/ ' + pad(slides.length) + '</span>';
      var prog = $('prog');
      prog.classList.remove('run'); void prog.offsetWidth;
      prog.style.animationDuration = DUREE + 'ms'; prog.classList.add('run');
      clearTimeout(timer);
      if (slides.length > 1) timer = setTimeout(function () { go(i + 1); }, DUREE);
    }
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
    go(0);

    // ----- Bandeau défilant -----
    var cats = site.categories.length ? site.categories : ['Bazin riche', 'Getzner', 'Dentelle', 'Wax', 'Brocart'];
    var mq = '';
    for (var r = 0; r < 4; r++) cats.forEach(function (m) { mq += '<span>' + esc(m) + '<b>✦</b></span>'; });
    $('mq').innerHTML = mq;

    // ----- La maison & la fondatrice -----
    $('maison-titre').innerHTML = esc(site.house.title) + '<br><em>' + esc(site.house.titleEm) + '</em>';
    $('maison-texte').innerHTML = paras(site.house.text);
    var f = site.founder;
    $('portrait').innerHTML = (f.photo
      ? '<img src="' + esc(f.photo) + '" alt="' + esc(f.name) + ', fondatrice de Chez Mère Lo" loading="lazy">'
      : '<div class="tex t-bordeaux"></div>') + '<div class="cadre"></div>';
    $('fondatrice').textContent = f.name;
    $('citation').textContent = f.quote ? '« ' + f.quote + ' »' : '';
    $('bio').innerHTML = paras(f.bio);

    // ----- Galerie -----
    if (site.gallery.length) {
      $('galerie').hidden = false;
      $('nav-galerie').hidden = false;
      $('mosaique').innerHTML = site.gallery.map(function (g, k) {
        return '<figure data-k="' + k + '"><img src="' + esc(g.image) + '" alt="' + esc(g.caption || 'Chez Mère Lo') + '" loading="lazy">' +
          (g.caption ? '<figcaption>' + esc(g.caption) + '</figcaption>' : '') + '</figure>';
      }).join('');
      $('mosaique').addEventListener('click', function (e) {
        var fig = e.target.closest('figure'); if (!fig) return;
        var g = site.gallery[+fig.dataset.k];
        var v = $('visionneuse');
        v.innerHTML = '<button class="fermer" aria-label="Fermer">×</button><img src="' + esc(g.image) + '" alt="' + esc(g.caption) + '">' +
          (g.caption ? '<p>' + esc(g.caption) + '</p>' : '');
        v.showModal();
      });
    }

    // ----- Services -----
    $('liste-services').innerHTML = site.services.map(function (s, k) {
      return '<div class="svc"><span>' + pad(k + 1) + '</span><h3>' + esc(s.title) + '</h3><p>' + esc(s.text) + '</p></div>';
    }).join('');

    // ----- Contact -----
    var wa = 'https://wa.me/' + c.whatsapp;
    $('adresse').textContent = c.address;
    $('wa-contact').href = wa + '?text=' + encodeURIComponent('Bonjour Chez Mère Lo, ');
    $('itineraire').href = c.mapsUrl || 'https://www.google.com/maps/search/' + encodeURIComponent(c.address);
    var tel = function (n) { return 'tel:' + String(n).replace(/[^\d+]/g, ''); };
    var infos = '';
    if (c.phone) infos += '<div><dt>TÉLÉPHONE</dt><dd><a href="' + tel(c.phone) + '">' + esc(c.phone) + '</a></dd></div>';
    if (c.phone2) infos += '<div><dt>' + esc((c.phone2Label || 'TÉLÉPHONE 2').toUpperCase()) + '</dt><dd><a href="' + tel(c.phone2) + '">' + esc(c.phone2) + '</a></dd></div>';
    if (c.hours) infos += '<div><dt>HORAIRES</dt><dd>' + esc(c.hours).replace(/\n/g, '<br>') + '</dd></div>';
    var reseaux = [['TikTok', c.tiktok], ['Facebook', c.facebook], ['Instagram', c.instagram]].filter(function (x) { return x[1]; });
    infos += '<div><dt>RÉSEAUX</dt><dd>' + (reseaux.length
      ? reseaux.map(function (x) { return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + x[0] + '</a>'; }).join(' · ')
      : 'TikTok · Facebook — Chez Mère Lo') + '</dd></div>';
    $('infos').innerHTML = infos;
    $('pied-paiement').textContent = 'Livraison · Paiement ' + site.payments.slice(0, 2).join(' & ');
    $('annee').textContent = new Date().getFullYear();

    // ----- Boutique -----
    var parId = {};
    produits.forEach(function (p) { parId[p.id] = p; });
    var presentes = cats.filter(function (cat) { return produits.some(function (p) { return p.category === cat; }); });
    produits.forEach(function (p) { if (presentes.indexOf(p.category) < 0) presentes.push(p.category); });
    var actif = 'Tout';
    $('filtres').innerHTML = ['Tout'].concat(presentes).map(function (cat) {
      return '<button aria-pressed="' + (cat === actif) + '" class="' + (cat === actif ? 'on' : '') + '">' + esc(cat) + '</button>';
    }).join('');
    $('filtres').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      actif = b.textContent;
      $('filtres').querySelectorAll('button').forEach(function (x) {
        var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on);
      });
      rendreGrille();
    });

    function carte(p, k) {
      var dispo = p.stock > 0;
      return '<article class="produit" style="animation-delay:' + (k * 90) + 'ms">' +
        '<button class="visuel" data-voir="' + p.id + '" aria-label="Voir ' + esc(p.name) + '">' + visuel(p) +
        '<span class="badge">' + esc(p.category.toUpperCase()) + '</span>' +
        (dispo ? '' : '<span class="badge epuise">ÉPUISÉ</span>') + '</button>' +
        '<h3>' + esc(p.name) + '</h3>' + (p.size ? '<span class="meta">' + esc(p.size) + '</span>' : '') +
        '<span class="prix">' + fcfa(p.price) + '</span>' +
        '<button class="ajout" data-ajout="' + p.id + '"' + (dispo ? '' : ' disabled') + '>' + (dispo ? 'AJOUTER AU PANIER' : 'ÉPUISÉ') + '</button></article>';
    }
    function rendreGrille() {
      var liste = actif === 'Tout' ? produits : produits.filter(function (p) { return p.category === actif; });
      $('grille').innerHTML = liste.length ? liste.map(carte).join('')
        : '<p class="vide">De nouvelles pièces arrivent bientôt. Écrivez-nous sur WhatsApp pour connaître les arrivages.</p>';
    }
    rendreGrille();

    $('grille').addEventListener('click', function (e) {
      var a = e.target.closest('[data-ajout]');
      if (a) return ajouter(+a.dataset.ajout);
      var v = e.target.closest('[data-voir]');
      if (v) ouvrirFiche(parId[+v.dataset.voir]);
    });

    function ouvrirFiche(p) {
      var dispo = p.stock > 0, d = $('fiche');
      d.innerHTML = '<div class="fiche"><div class="visuel">' + visuel(p) + '</div><div class="fiche-txt">' +
        '<button class="fermer" aria-label="Fermer">×</button>' +
        '<span class="kicker">' + esc(p.category.toUpperCase()) + '</span><h2>' + esc(p.name) + '</h2>' +
        (p.size ? '<span class="meta">' + esc(p.size) + '</span>' : '') +
        '<span class="prix" style="font-size:20px">' + fcfa(p.price) + '</span>' +
        (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
        '<span class="meta">' + (dispo ? (p.stock <= 3 ? 'Plus que ' + p.stock + ' en stock' : 'En stock') : 'Épuisé — demandez le prochain arrivage sur WhatsApp') + '</span>' +
        '<button class="btn btn-or" data-ajout="' + p.id + '"' + (dispo ? '' : ' disabled') + '>AJOUTER AU PANIER</button></div></div>';
      d.showModal();
    }
    $('fiche').addEventListener('click', function (e) {
      var a = e.target.closest('[data-ajout]');
      if (a) { ajouter(+a.dataset.ajout); this.close(); return; }
      if (e.target.closest('.fermer') || e.target === this) this.close();
    });
    $('visionneuse').addEventListener('click', function () { this.close(); });

    // ----- Panier -----
    var CLE = 'cml_panier';
    var panier = [];
    try { panier = JSON.parse(localStorage.getItem(CLE)) || []; } catch (e) { panier = []; }
    panier = panier.filter(function (l) { return parId[l.id] && parId[l.id].stock > 0; })
      .map(function (l) { return { id: l.id, qty: Math.min(l.qty, parId[l.id].stock) }; });
    var vue = 'panier', formulaire = {};

    function sauver() {
      try { localStorage.setItem(CLE, JSON.stringify(panier)); } catch (e) { /* stockage indisponible */ }
      $('nb').textContent = panier.reduce(function (s, l) { return s + l.qty; }, 0);
    }
    function sousTotal() { return panier.reduce(function (s, l) { return s + parId[l.id].price * l.qty; }, 0); }
    function toast(msg) {
      var t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }
    function ajouter(id) {
      var p = parId[id], l = panier.find(function (x) { return x.id === id; });
      if (l && l.qty >= p.stock) return toast('Stock maximum atteint pour ' + p.name);
      if (l) l.qty++; else panier.push({ id: id, qty: 1 });
      sauver(); toast(p.name + ' ajouté au panier');
    }
    function ouvrir() {
      vue = 'panier'; rendrePanier();
      $('tiroir').classList.add('on'); $('voile').classList.add('on');
      $('tiroir').setAttribute('aria-hidden', 'false'); document.body.classList.add('lock');
    }
    function fermer() {
      $('tiroir').classList.remove('on'); $('voile').classList.remove('on');
      $('tiroir').setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock');
    }
    $('ouvrir-panier').addEventListener('click', ouvrir);
    $('fermer-panier').addEventListener('click', fermer);
    $('voile').addEventListener('click', fermer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });

    function zoneChoisie() {
      return site.delivery.find(function (z) { return z.name === formulaire.zone; }) || site.delivery[0] || { name: '', price: 0 };
    }

    function rendrePanier() {
      var corps = $('tiroir-corps'), pied = $('tiroir-pied');
      if (vue === 'panier') {
        $('tiroir-titre').textContent = 'Votre panier';
        if (!panier.length) {
          corps.innerHTML = '<div class="merci"><p>Votre panier est vide.</p><button class="lien-btn" data-action="fermer">DÉCOUVRIR LA BOUTIQUE →</button></div>';
          pied.innerHTML = ''; return;
        }
        corps.innerHTML = panier.map(function (l) {
          var p = parId[l.id];
          return '<div class="ligne"><div class="mini">' + visuel(p) + '</div><div><b>' + esc(p.name) + '</b><small>' + fcfa(p.price) + (p.size ? ' · ' + esc(p.size) : '') + '</small><br>' +
            '<button class="retirer" data-retirer="' + p.id + '">Retirer</button></div>' +
            '<div class="qte"><button data-moins="' + p.id + '" aria-label="Moins">−</button><span>' + l.qty + '</span>' +
            '<button data-plus="' + p.id + '" aria-label="Plus"' + (l.qty >= p.stock ? ' disabled' : '') + '>+</button></div></div>';
        }).join('');
        pied.innerHTML = '<div class="totaux"><div class="total"><span>Sous-total</span><span>' + fcfa(sousTotal()) + '</span></div></div>' +
          '<button class="btn btn-or" data-action="commander">COMMANDER</button>';
      } else if (vue === 'commande') {
        $('tiroir-titre').textContent = 'Vos coordonnées';
        var z = zoneChoisie();
        corps.innerHTML = '<form class="form" id="form-commande" novalidate>' +
          '<label>NOM COMPLET<input name="name" autocomplete="name" required value="' + esc(formulaire.name) + '"></label>' +
          '<label>TÉLÉPHONE / WHATSAPP<input name="phone" type="tel" autocomplete="tel" required placeholder="77 000 00 00" value="' + esc(formulaire.phone) + '"></label>' +
          '<label>LIVRAISON<select name="zone">' + site.delivery.map(function (d) {
            return '<option' + (d.name === z.name ? ' selected' : '') + ' value="' + esc(d.name) + '">' + esc(d.name) + (d.price ? ' — ' + fcfa(d.price) : '') + '</option>';
          }).join('') + '</select></label>' +
          '<label>ADRESSE DE LIVRAISON<textarea name="address" autocomplete="street-address" placeholder="Quartier, rue, point de repère">' + esc(formulaire.address) + '</textarea></label>' +
          '<div class="choix" role="radiogroup" aria-label="Paiement"><span style="font-size:12px;letter-spacing:.14em;color:rgba(244,238,227,.7)">PAIEMENT</span>' +
          site.payments.map(function (m, k) {
            var on = formulaire.payment ? formulaire.payment === m : k === 0;
            return '<label><input type="radio" name="payment" value="' + esc(m) + '"' + (on ? ' checked' : '') + '>' + esc(m) + '</label>';
          }).join('') + '</div>' +
          '<label>MESSAGE (FACULTATIF)<textarea name="note" placeholder="Couleur souhaitée, date de la cérémonie…">' + esc(formulaire.note) + '</textarea></label>' +
          '<p class="erreur" id="erreur" role="alert"></p></form>';
        pied.innerHTML = '<div class="totaux"><div><span>Sous-total</span><span>' + fcfa(sousTotal()) + '</span></div>' +
          '<div><span>Livraison</span><span id="frais">' + (z.price ? fcfa(z.price) : 'Offerte / à confirmer') + '</span></div>' +
          '<div class="total"><span>Total</span><span id="total">' + fcfa(sousTotal() + z.price) + '</span></div></div>' +
          '<button class="btn btn-or" data-action="valider" id="valider">VALIDER LA COMMANDE</button>' +
          '<button class="lien-btn" data-action="retour">← RETOUR AU PANIER</button>';
        var form = $('form-commande');
        form.addEventListener('input', function () {
          formulaire = Object.fromEntries(new FormData(form));
          var z2 = zoneChoisie();
          $('frais').textContent = z2.price ? fcfa(z2.price) : 'Offerte / à confirmer';
          $('total').textContent = fcfa(sousTotal() + z2.price);
        });
        form.addEventListener('submit', function (e) { e.preventDefault(); valider(); });
      }
    }

    $('tiroir').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var id = +(t.dataset.plus || t.dataset.moins || t.dataset.retirer || 0);
      var l = panier.find(function (x) { return x.id === id; });
      if (t.dataset.plus && l && l.qty < parId[id].stock) l.qty++;
      else if (t.dataset.moins && l) { l.qty--; if (!l.qty) panier.splice(panier.indexOf(l), 1); }
      else if (t.dataset.retirer && l) panier.splice(panier.indexOf(l), 1);
      else if (t.dataset.action === 'fermer') { fermer(); return; }
      else if (t.dataset.action === 'commander') vue = 'commande';
      else if (t.dataset.action === 'retour') vue = 'panier';
      else if (t.dataset.action === 'valider') { valider(); return; }
      else return;
      sauver(); rendrePanier();
    });

    function valider() {
      var form = $('form-commande');
      formulaire = Object.fromEntries(new FormData(form));
      var err = $('erreur');
      if (!formulaire.name.trim()) { err.textContent = 'Merci d\'indiquer votre nom.'; return; }
      if (formulaire.phone.replace(/\D/g, '').length < 7) { err.textContent = 'Merci d\'indiquer un numéro de téléphone valide.'; return; }
      var bouton = $('valider'); bouton.disabled = true; bouton.textContent = 'ENVOI…';
      fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, formulaire, { items: panier }))
      }).then(function (r) {
        return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });
      }).then(function (cmd) {
        panier.forEach(function (l) { parId[l.id].stock -= l.qty; });
        panier = []; sauver(); rendreGrille();
        merci(cmd);
      }).catch(function (e) {
        err.textContent = e.message === 'Failed to fetch' ? 'Connexion impossible. Vérifiez votre réseau et réessayez.' : e.message;
        bouton.disabled = false; bouton.textContent = 'VALIDER LA COMMANDE';
      });
    }

    function merci(cmd) {
      vue = 'merci';
      var msg = 'Bonjour Chez Mère Lo, je viens de passer la commande n°' + cmd.id + ' sur le site :\n' +
        cmd.lines.map(function (l) { return '• ' + l.qty + ' × ' + l.name + ' (' + fcfa(l.price) + ')'; }).join('\n') +
        '\nLivraison : ' + cmd.zone + (cmd.delivery ? ' (' + fcfa(cmd.delivery) + ')' : '') +
        '\nTotal : ' + fcfa(cmd.total) + '\nPaiement : ' + cmd.payment +
        '\nNom : ' + formulaire.name + '\nTéléphone : ' + formulaire.phone +
        (formulaire.address ? '\nAdresse : ' + formulaire.address : '');
      $('tiroir-titre').textContent = 'Merci !';
      $('tiroir-corps').innerHTML = '<div class="merci"><svg width="88" height="88" aria-hidden="true"><use href="#sceau"/></svg>' +
        '<h3>Commande n°' + cmd.id + ' reçue</h3>' +
        '<p>Total : <strong>' + fcfa(cmd.total) + '</strong><br>Paiement : ' + esc(cmd.payment) + '</p>' +
        '<p>Envoyez-nous la commande sur WhatsApp pour que nous la confirmions rapidement' +
        (/wave|orange/i.test(cmd.payment) ? ' et que nous vous indiquions comment régler par ' + esc(cmd.payment) : '') + '.</p>' +
        '<a class="btn btn-or" target="_blank" rel="noopener" href="' + wa + '?text=' + encodeURIComponent(msg) + '">ENVOYER SUR WHATSAPP</a></div>';
      $('tiroir-pied').innerHTML = '<button class="lien-btn" data-action="fermer">CONTINUER MES ACHATS</button>';
      formulaire = { name: formulaire.name, phone: formulaire.phone, address: formulaire.address };
    }

    sauver();

    // ----- En-tête & menu -----
    var header = $('top');
    window.addEventListener('scroll', function () { header.classList.toggle('scrolled', window.scrollY > 40); }, { passive: true });
    var burger = $('burger'), menu = $('menu');
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); });
    });

    // ----- Apparition au défilement -----
    var rvs = document.querySelectorAll('.rv');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.15 });
      rvs.forEach(function (el) { io.observe(el); });
    } else rvs.forEach(function (el) { el.classList.add('in'); });
  }

  if (window.__DATA__) start(window.__DATA__);
  else fetch('/api/public').then(function (r) { return r.json(); }).then(start);
})();
