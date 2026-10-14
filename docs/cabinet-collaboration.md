# Collaboration SmilePec — état et configuration

Les comptes cabinet existants conservent leurs outils. Les nouveaux comptes commencent dans SmilePec : demande, rendez-vous, devis PDF, décision du titulaire. Seule une acceptation enregistrée côté serveur active les outils. Les membres du cabinet ne peuvent pas accepter au nom du titulaire.

Les documents sont privés, liés au cabinet et transférés par fragments de 256 Ko (50 Mo maximum). Ils deviennent accessibles à l'autre partie après transmission. La messagerie affiche un aperçu avant confirmation. Les brouillons du profil, des fiches PEC (y compris les pièces) et des conversations sont stockés par compte dans PostgreSQL. Un brouillon d'une ancienne révision ne remplace pas une fiche plus récente. Les champs d'authentification ne sont pas enregistrés. La conservation des brouillons est de 90 jours.

## E-mails

RESEND_API_KEY est une variable secrète Vercel. BILLING_FROM_EMAIL doit appartenir à un domaine vérifié. SMILEPEC_MANAGER_EMAIL définit la copie pour SmilePec. PUBLIC_APP_URL vaut par défaut https://amelib.vercel.app.

SMILEPEC_MAIL_READY=1 doit être activé seulement après validation DNS du domaine dans Resend. Le domaine smilepec.fr est préparé, mais ses DNS restent à valider chez le fournisseur. Le lien Vercel ne remplace pas la validation d'un domaine d'envoi. En attendant, les notifications sont disponibles sur le site et les copies restent dans une file persistante. Les notifications email ne contiennent pas de données patient, seulement un lien sécurisé. Les rendez-vous incluent une invitation ICS.

## Rendez-vous et visio

L'équipe peut configurer Calendly et Google Agenda dans la page de collaboration, section rendez-vous. Ce sont des liens de réservation externes. Les événements externes doivent ensuite être confirmés dans SmilePec : aucune synchronisation OAuth n'est annoncée.

La visio SmilePec utilise WebRTC et un échange de signaux authentifié. Elle est limitée à un rendez-vous confirmé, une heure avant et deux heures après. Aucun enregistrement ni transcription audio. Les réseaux qui bloquent les connexions directes nécessitent un relais TURN : SMILEPEC_TURN_URL, SMILEPEC_TURN_USER, SMILEPEC_TURN_PASSWORD. Sans relais configuré, la connexion sur tous les réseaux n'est pas garantie. Un lien Google Meet externe peut être ajouté au rendez-vous comme solution de repli.

## Validation

Tests locaux : tests/collaboration.mjs, tests/pec-workflow.mjs, tests/separation.mjs, tests/command-center.mjs, tests/unit.mjs. Les tests utilisent une base isolée et des données fictives. Ils couvrent le cloisonnement cabinet/admin, les droits, les décisions sur devis et leur rejeu, les fichiers privés, les rendez-vous, les brouillons sur une nouvelle session et la file d'email.

Les protections incluent cookie HttpOnly/Secure/SameSite, vérification d'origine des écritures, quotas, contrôle d'accès serveur, validation de format des fichiers et empreinte SHA-256, CSP, anti-framing et HSTS. Cette validation n'est pas une certification de sécurité ni une certification HDS. Les mentions existantes sur les données de démonstration restent applicables.
