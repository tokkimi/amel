# Amelib

Application web responsive de démonstration pour la coordination orthodontique.

## Démarrage

- `npm install`
- `npm run dev`
- `npm run build`

## Parcours disponibles

Tableau de bord, agenda (création, confirmation, annulation et détection des créneaux identiques), dossiers patients, annuaire et profils professionnels, conversations locales, journal de recettes/dépenses avec export CSV, carte de trajet simulé et administration de démonstration. Les données fictives sont conservées dans le localStorage du navigateur.

## Limites de cette version

Ce prototype ne doit pas recevoir de vraies données de santé. Aucun serveur de données, authentification, contrôle des rôles, messagerie distante, paiement ou GPS partagé réel n'est connecté. Les comptes de démonstration sont sélectionnables librement. La comptabilité est un journal de démonstration et ne constitue pas une solution comptable réglementaire.

Pour la production : intégrer une authentification et des autorisations serveur par organisation, une base sécurisée avec journalisation, les règles applicables aux données de santé, une réservation transactionnelle tenant compte de la durée des soins, la facturation et ses intégrations, et le partage GPS à consentement explicite limité aux interventions actives. Les tuiles cartographiques sont fournies par OpenStreetMap ; prévoir un service cartographique adapté au trafic de production.

## Déploiement

Projet Vite prêt pour Vercel. `vercel --prod`.
