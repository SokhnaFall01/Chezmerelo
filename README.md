# Chez Mère Lo — site & boutique en ligne

Site de la maison de tissus de luxe **Chez Mère Lo** (HLM Grand Yoff, Dakar), avec un espace d'administration pour gérer la boutique sans toucher au code.

## Ce que fait le site

**Côté clientes** (`/`)
- Page d'accueil : diaporama photo, la maison, la fondatrice (photo + histoire), galerie photos, services, boutique, contact.
- Boutique : filtres par matière, fiche produit, panier, commande avec choix de la zone de livraison et du moyen de paiement (Wave, Orange Money, espèces).
- Après la commande, la cliente l'envoie en un clic sur WhatsApp à la boutique.
- Le stock est vérifié : impossible de commander plus de pièces qu'il n'en reste ; un produit à 0 s'affiche « Épuisé ».

**Côté administration** (`/admin`, protégé par mot de passe — utilisable sur téléphone)
- **Commandes** : liste des commandes, statut (nouvelle → confirmée → payée → livrée / annulée), bouton pour répondre à la cliente sur WhatsApp, chiffre d'affaires du mois. Annuler une commande remet les pièces en stock.
- **Produits & stock** : ajouter un nouveau tissu (photo, prix, métrage, description), ajuster le stock avec − / +, masquer, réordonner, supprimer.
- **Page d'accueil** : photos et textes du diaporama, photo et histoire de la fondatrice, galerie photos, textes « La maison » et services.
- **Infos & livraison** : téléphones, numéro WhatsApp qui reçoit les commandes, horaires, réseaux sociaux, zones et prix de livraison, moyens de paiement, catégories.
- **Compte** : changer le mot de passe.

Les photos prises au téléphone sont automatiquement réduites avant l'envoi pour que le site reste rapide.

## Lancer le site sur un ordinateur

Il faut [Node.js](https://nodejs.org) version 20 ou plus récente.

```bash
npm install
ADMIN_PASSWORD="un-mot-de-passe-solide" npm start
```

- Site : http://localhost:3000
- Admin : http://localhost:3000/admin

Sans `ADMIN_PASSWORD`, le mot de passe initial est `merelo2026` : changez-le tout de suite dans l'onglet **Compte**.

Les produits de départ (prix et stocks) sont des **exemples** : modifiez-les ou supprimez-les dans l'admin avant la mise en ligne.

## Mise en ligne sur Vercel

Sur Vercel, le serveur ne garde aucun fichier : les produits, commandes et textes vont dans une base **Turso**, les photos dans **Vercel Blob**. Les deux ont une offre gratuite suffisante pour démarrer.

1. **Importer le projet** : sur vercel.com → *Add New… → Project* → choisir le dépôt GitHub `Chezmerelo` → *Deploy* (aucun réglage à changer, `vercel.json` s'en occupe).
2. **Photos** : dans le projet → onglet *Storage* → *Create* → **Blob** → le connecter au projet. La variable `BLOB_READ_WRITE_TOKEN` est ajoutée toute seule.
3. **Base de données** : onglet *Storage* → **Turso** (Marketplace) → créer une base et la connecter au projet.
   Les variables `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` sont ajoutées. Si vous créez la base directement sur turso.tech, ajoutez ces deux variables à la main dans *Settings → Environment Variables*.
4. **Mot de passe admin** : *Settings → Environment Variables* → ajouter `ADMIN_PASSWORD` avec un mot de passe solide (utilisé au tout premier lancement ; ensuite il se change dans l'admin).
5. **Redéployer** : onglet *Deployments* → *Redeploy*, pour que les variables soient prises en compte.
6. Ouvrir `https://votre-projet.vercel.app/admin` et se connecter.
7. (Facultatif) **Nom de domaine** : *Settings → Domains* → ajouter par exemple `chezmerelo.com`.

| Variable | Rôle |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Base de données en ligne |
| `BLOB_READ_WRITE_TOKEN` | Stockage des photos |
| `ADMIN_PASSWORD` | Mot de passe admin initial |
| `DATA_DIR`, `PORT` | Uniquement hors Vercel (dossier des données locales, port) |

Ailleurs que sur Vercel (VPS, Docker…), sans ces variables, le site utilise un fichier SQLite et un dossier de photos dans `DATA_DIR` (à mettre sur un disque persistant) :

```bash
docker build -t chezmerelo .
docker run -p 3000:3000 -v chezmerelo-data:/data -e ADMIN_PASSWORD="..." chezmerelo
```

## Organisation du code

```
server.js            serveur (pages, API boutique et admin)
api/index.js         point d'entrée Vercel
vercel.json          configuration Vercel
src/db.js            base de données (Turso en ligne, SQLite en local) + contenu par défaut
src/auth.js          connexion admin
public/index.html    page d'accueil
public/css/site.css  styles du site
public/js/site.js    boutique, panier, commande
public/admin/        espace d'administration
```
