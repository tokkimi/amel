# Connexions d’agenda SmilePec — 27 octobre 2026

## Livré
Dans Admin → Demandes SmilePec → Connecter Google Agenda ou Calendly, chaque administratrice dispose d’une connexion personnelle. OAuth code + PKCE S256, état unique lié à la session (10 minutes), jetons AES-256-GCM côté serveur, renouvellement des jetons, déconnexion. Les détails et jetons privés ne sont jamais exposés au cabinet ni au navigateur.

Google : lecture des occupations de l’agenda principal. Les horaires ouverts dans SmilePec sont retirés s’ils chevauchent une occupation Google.
Calendly : lecture des occupations et choix d’un type de rendez-vous actif de 30 minutes. Ses disponibilités des sept prochains jours sont importées dans les créneaux SmilePec. Les réservations SmilePec existantes restent prioritaires et ne sont pas écrasées. Les créneaux importés ouverts sont retirés à la déconnexion.
Actualisation à la consultation (cache 60 secondes), contrôle frais avant réservation. Échec du fournisseur : masquage des créneaux concernés. Aucun horaire n’est inventé.

## Configuration encore nécessaire
- GOOGLE_CALENDAR_CLIENT_ID et GOOGLE_CALENDAR_CLIENT_SECRET : application Web Google Cloud, API Calendar activée. Scope : https://www.googleapis.com/auth/calendar.freebusy . Configurer l’écran de consentement ; si application en test, ajouter Amel et Sofiana aux utilisatrices autorisées.
- CALENDLY_CLIENT_ID et CALENDLY_CLIENT_SECRET : application Web Calendly Developer. Scopes users:read availability:read event_types:read .
- CALENDAR_TOKEN_ENCRYPTION_KEY : 32 octets hexadécimaux ; installée en variable sensible Production. Ne pas la remplacer sans déconnecter/reconnecter les comptes existants.
- Retours OAuth exacts enregistrés chez les fournisseurs :
  - https://amelib.vercel.app/api/calendar-callback?provider=google
  - https://amelib.vercel.app/api/calendar-callback?provider=calendly
- PUBLIC_APP_URL est facultatif (amelib.vercel.app par défaut). Lors d’une migration de domaine, mettre à jour les retours enregistrés avant cette variable.
- Après ajout des identifiants sécurisés, redéployer. Chaque utilisatrice doit accepter elle-même l’autorisation de son fournisseur.

## Limites à annoncer
La connexion synchronise les disponibilités entrantes. Cette version ne crée, n’annule et ne modifie aucun événement dans les agendas externes. Une réservation SmilePec n’est donc pas encore une invitation Google ni une réservation native Calendly. Les notifications internes restent indépendantes du fournisseur. Les e-mails demeurent soumis à l’activation de l’expéditeur. L’activation réelle et la disponibilité des API dépendent des comptes et autorisations des fournisseurs. Aucune validation sur compte réel n’a eu lieu sans identifiants OAuth.

## Tests
node tests/calendar-connections.mjs : chiffrement, altération, PKCE, refus de session différente, refus du rejeu, isolation des comptes, filtrage occupé, échec fermé, récupération après panne, import Calendly, sélection de type, retrait des créneaux à la déconnexion. Fournisseurs simulés, pas d’appels réels à des comptes utilisateurs.
node tests/collaboration.mjs : droits admin uniquement, réservation, conflits, demandes + notifications même sans mail.
node tests/separation.mjs ; npm run build.
