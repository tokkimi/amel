# Correctif admin SmilePec (à déposer tel quel, aucun fichier existant modifié)

1. Copier `vite.config.js` et le dossier `smilepec-patch/` à la racine du projet (à côté de `vite.config.ts`).
2. Déployer comme d'habitude.

Effet :
- « Agendas connectés » (Google Agenda / Calendly) apparaissent dans **Paramètres › Plateforme**, ouverts, pour chaque admin connecté ; l'ancien bloc replié de Demandes SmilePec est masqué. Retour automatique sur Paramètres après la connexion OAuth.
- Sur mobile, la barre d'onglets de l'admin passe à la ligne au lieu de défiler (plus besoin de garder le doigt appuyé).

`vite.config.js` reprend `vite.config.ts` sans le modifier et ajoute uniquement le script du correctif.
Testé : build Vite OK, affichage et appels `cc-calendar-*` vérifiés dans un navigateur mobile simulé.
