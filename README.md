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

Il faut [Node.js](https://nodejs.org) version 22.13 ou plus récente.

```bash
npm install
ADMIN_PASSWORD="un-mot-de-passe-solide" npm start
```

- Site : http://localhost:3000
- Admin : http://localhost:3000/admin

Sans `ADMIN_PASSWORD`, le mot de passe initial est `merelo2026` : changez-le tout de suite dans l'onglet **Compte**.

Les produits de départ (prix et stocks) sont des **exemples** : modifiez-les ou supprimez-les dans l'admin avant la mise en ligne.

## Mise en ligne

Toutes les données (produits, commandes, textes, photos) sont dans le dossier `data/` (ou celui indiqué par la variable `DATA_DIR`). Il doit être sur un **disque persistant** et sauvegardé régulièrement.

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (3000 par défaut) |
| `DATA_DIR` | Dossier des données et des photos (`./data` par défaut) |
| `ADMIN_PASSWORD` | Mot de passe admin initial (utilisé seulement au tout premier démarrage) |

Hébergeurs adaptés : un petit serveur VPS, ou une plateforme comme Railway / Render / Fly.io **avec un volume persistant** monté sur `DATA_DIR`. Un `Dockerfile` est fourni.

```bash
docker build -t chezmerelo .
docker run -p 3000:3000 -v chezmerelo-data:/data -e ADMIN_PASSWORD="..." chezmerelo
```

## Organisation du code

```
server.js            serveur (pages, API boutique et admin)
src/db.js            base de données SQLite + contenu par défaut
src/auth.js          connexion admin
public/index.html    page d'accueil
public/css/site.css  styles du site
public/js/site.js    boutique, panier, commande
public/admin/        espace d'administration
```
