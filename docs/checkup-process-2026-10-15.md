# Check-up du parcours SmilePec — 15 octobre 2026

Périmètre : inscription du cabinet, demande, échanges avec SmilePec, rendez-vous, devis, ouverture des outils, documents, contrats, équipe interne, archivage et présentation publique. Audit du code et tests sur base isolée ; ce bilan ne constitue pas un test de visio à deux appareils, un envoi réel d'email ou une signature électronique réelle.

| Fonction | État constaté | Preuve / limite |
|---|---|---|
| Inscription cabinet puis demande | Implémenté | API signup, écran CabinetAccess, collaboration-request ; champs compte et premier contact. |
| Échanges cabinet / SmilePec | Testé côté serveur | collaboration-message, visibilité public/internal, contrôle cabinet. |
| Rendez-vous demandé puis confirmé | Testé côté serveur | Cabinet ne peut pas confirmer ; équipe habilitée confirme, invitation ICS. |
| Calendly / Google Agenda | Lien de réservation uniquement | Configuration dans la collaboration, pas de connexion OAuth ni synchro ni blocage automatique des doublons dans SmilePec. |
| Visio interne | Implémentée, validation réelle incomplète | WebRTC, signaux authentifiés ; TURN non confirmé, aucun test réel deux appareils. |
| Visio externe | Implémentée | Lien HTTPS ajouté par SmilePec ; pas de création automatique Google Meet. |
| Devis PDF et aperçu | Implémenté / serveur testé | Envoi PDF dans collaboration ; aperçu puis acceptation/refus du titulaire. |
| Ouverture des outils | Testée côté serveur | Activation atomique sur devis accepté, rejeu refusé, comptes existants conservés. |
| Photos et pièces multiples | Implémenté | 10 pièces, 50 Mo chacune, fragments ; glisser-déposer ajouté localement pendant le check-up, pas encore publié. |
| Aperçu de toutes les transmissions | Partiel | Aperçu document dans support et aperçu final dans collaboration ; pas de revue finale uniforme de tous les canaux. |
| Email automatique | Préparé, pas vérifié en production | File persistante ; domaine expéditeur à valider et SMILEPEC_MAIL_READY à activer après validation. |
| Boutons email / WhatsApp pour documents | Incomplet | Liens de contact publics existent ; pas de transfert automatique des pièces ni d'archivage des réponses externes. Un mailto ne joint pas un fichier. |
| Notes internes admin | Implémentées / isolation testée | support_messages visibility=internal et internal_notes. |
| Comptes admin séparés | Droits existants, invitation absente | cc-role-assign change les droits d'un admin existant ; aucune création/invitation prestataire admin. L'invitation cabinet TeamPanel ne répond pas à ce besoin. |
| Contrat : modèles / édition / versions | Absent | Aucun moteur de contrat spécifique ; devis PDF seul insuffisant. |
| Signature électronique | Absente | Accepter le devis ne fournit pas le parcours de signature demandé. Prévoir identité du signataire, version figée, empreinte et dossier de preuve via prestataire adapté. |
| Archivage par cabinet | Implémenté | service_files privés, fragments PostgreSQL, messages et devis conservés côté serveur. |
| Bibliothèque par dossier PEC | Partielle | Pièces PEC présentes, bibliothèque collaboration organisée par conversations/cabinet ; pas de classement unique contrats/factures/versions par dossier. |
| Conservation multiappareil | Tests serveur réussis | Brouillons par compte, pièces et accès contrôlés ; test navigateur de reprise de contact réalisé au développement précédent. Pas un test exhaustif de chaque écran. |
| Google Drive | Absent | Aucun OAuth Drive, sélection dossier, synchronisation, révocation ou gestion de conflits. |
| Écran d'entrée et titre animé | Corrigés localement | Logo original, beige #e4d5c9, mention originale, entrée explicite ; apparition mot par mot 190 ms / transition 700 ms, mouvement réduit respecté. Non publié pendant cet audit. |

## Organisation proposée

Conserver un espace cabinet de transmission et un espace équipe SmilePec distinct. Dans l'admin, une fiche cabinet doit réunir demandes, rendez-vous, contrats, facturation, documents et notes internes ; les notes restent privées. Les dossiers PEC gardent leurs pièces propres et un lien vers le cabinet.

Priorité 1 : terminer les dépendances déjà promises (emails, visio réseau), invitation admin à droits minimaux et synchronisation des disponibilités. Priorité 2 : modèles de contrat, prévisualisation, validation de version puis signature avec preuve. Priorité 3 : bibliothèque unique par dossier et éventuelle connexion Drive. Ajouter des actions externes seulement avec un état réel de transmission, sans annoncer qu'un message externe est archivé automatiquement.

Drive réutilise le quota disponible du compte Google ; il ne rend ni l'application, ni sa base de données, ni toute capacité de stockage gratuits. Il faut conserver la base métier et ses droits. Évaluer l'hébergement des données patient et les habilitations avant de choisir le stockage ; les mentions actuelles limitent le site aux données de démonstration avant HDS.

## Tests exécutés

node tests/collaboration.mjs — réussi.
node tests/separation.mjs — réussi.
node tests/pec-workflow.mjs — réussi.
node tests/unit.mjs — réussi.

Ces tests prouvent les contrôles et comportements serveur décrits, pas la configuration réelle des fournisseurs externes. Aucun email ou document client réel envoyé pour ce check-up.
