# Amelib

Application publique et espaces privés distincts pour patients, professionnels et intervenants.

## Disponible

- Accueil public, recherche par nom/spécialité/ville, profils publiés par leurs propriétaires.
- Inscription, connexion par mot de passe, sessions HTTP-only et récupération par code individuel.
- Rôles immuables dans l’interface et autorisations vérifiées pour chaque requête serveur.
- Création de disponibilités sans chevauchement, réservation atomique, annulation et réouverture du créneau.
- Un même rendez-vous visible par son patient et son professionnel, messagerie limitée aux participants.
- Journal privé de recettes/dépenses et export CSV.
- Administration accessible uniquement aux comptes auxquels le rôle admin est attribué en base.

## Infrastructure

Vite / React / TypeScript, fonctions Vercel, base PostgreSQL Neon dédiée à Amelib (région Francfort, offre gratuite). Aucun stockage local ne fait autorité pour l’identité, les rôles ou les rendez-vous. Le serveur détermine le propriétaire à partir de la session.

## Développement

`npm install`, puis configurer DATABASE_URL dans .env.local. Ne jamais committer ce fichier.

- `npm run dev` : interface seulement ; les appels API nécessitent Vercel dev ou une version déployée.
- `vercel dev` : interface et API.
- `npm run build` : vérification TypeScript et compilation.
- `node --env-file=.env.local scripts/migrate.mjs` : schéma idempotent.
- `node --env-file=.env.local tests/integration.mjs` : tests avec comptes temporaires isolés, supprimés en fin de test.
- `vercel --prod` : publication.

## Routes

/ : accueil public ; /recherche : annuaire ; /praticiens/:id : profil public ; /patient : compte patient ; /pro : compte professionnel ; /intervenant : compte intervenant ; /admin : administration.

## Limites à traiter avant ouverture à des dossiers de santé

La vérification d’adresse e-mail et la récupération par e-mail ne sont pas connectées (un code de récupération est fourni une seule fois à l’inscription). Les identifiants professionnels sont déclaratifs jusqu’à validation par un administrateur. L’envoi de notifications e-mail/SMS, les dossiers cliniques, le GPS partagé en direct, la facturation réglementaire et les paiements ne sont pas activés. La messagerie sert à coordonner les rendez-vous : ne pas y déposer de dossier médical. Le cadre de production pour les données de santé doit être finalisé avant cet usage.

Les comptes de l’ancienne démo locale ne sont pas migrés : ils n’étaient pas authentifiés. L’annuaire ne contient aucun professionnel inventé et démarre vide jusqu’aux premières publications.

## Administration et mobile

L’administration dispose de statistiques, filtres des comptes, vérification des professionnels, suspension/réactivation avec invalidation des sessions, retrait des profils, suivi des rendez-vous, export CSV, journal de décisions et paramètres publics. Toute mutation est contrôlée côté serveur et consignée. Le compte administrateur de test demandé est créé ; ses accès sont conservés hors du dépôt.

La navigation mobile utilise une barre d’onglets fixe sur le site public et dans chaque espace, des menus depuis le bas et un historique de navigation conservant l’onglet dans l’URL. La webapp possède un manifeste pour le mode autonome ; elle n’est pas une application native et ne fonctionne pas hors ligne.

Tests supplémentaires : `node --env-file=.env.local tests/admin.mjs` et `node --env-file=.env.local tests/deployed.mjs`.
