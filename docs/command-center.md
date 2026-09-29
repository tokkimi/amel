# Amelib Command Center — espace admin central (Amel)

Périmètre : **uniquement** le back-office `/admin` (compte `role = 'admin'`). La homepage publique, les pages publiques, le SEO et les espaces cabinets ne sont pas modifiés (seule exception, voir « Impact » : les libellés de statut des tickets vus par le cabinet).

## A. Audit de l'existant (avant modification)

| Élément | Constat |
|---|---|
| Architecture | SPA Vite/React 19/TS (`src/`), une seule fonction Vercel `api/index.mjs` routée par `?action=`, Neon PostgreSQL via `@neondatabase/serverless` (HTTP). Pas de router : `Portal.tsx` choisit l'espace selon `location.pathname` et le rôle. |
| Auth | Sessions HTTP-only (`sessions.token_hash`), rôle immuable `accounts.role` ∈ patient/professional/worker/admin, `roleCheck(account, "admin")`. CSRF : contrôle `Origin` sur chaque POST. Rate-limit en base. |
| Modèle « cabinet » | Pas de table cabinet : un cabinet = un compte `professional` titulaire ; l'équipe = `clinic_members(owner_id, member_id, permissions)`. `workspaceId` = titulaire. |
| Admin existant | `AdminConsole.tsx` (onglets Vue d'ensemble, Comptes, Vérifications, Rendez-vous, Journal, Paramètres, Priorités, Bilan comptable), `AdminCabinets.tsx`, `SupportPanel.tsx` (mode admin). Un seul endpoint `admin` charge jusqu'à 1 000 comptes + 1 000 RDV + 2 000 documents d'un coup. |
| Données | `business_documents` (devis/factures **des cabinets à leurs patients**), `tasks` (tâches internes cabinet), `support_tickets` (sans priorité ni historique, une seule `admin_reply`), `audit_log` (actor/action/target/detail), `notifications`, `platform_settings`, `patient_records` (contient allergies, traitements, schéma dentaire, NIR…). |
| Réutilisable | `api()` client, `usePanel`, `downloadWorkbook`, tokens de marque SmilePec, `audit_log`, `notifications`, actions `admin-verify/suspend/unpublish/settings`, `admin-account-update`. |
| Problèmes détectés | Vérification binaire (`profiles.verified`) ; pas d'assignation/échéance côté Amelib ; support sans notes internes ni SLA ; admin = rôle unique non granulaire ; aucune séparation entre argent des cabinets et revenus Amelib ; payload `admin` monolithique ; `tests/integration.mjs` échoue déjà avant cette mission (inscription patient refusée par le produit depuis la refonte SmilePec) ; la règle globale `button:not(.pro-menu-shade)` de `brand-glass.css` impose des fonds transparents `!important`. |

## B. Mapping des fonctionnalités

| # | Fonctionnalité | Avant | Statut livré |
|---|---|---|---|
| 4 | Navigation Command Center (8 sections + Administration) | À refactorer | ✅ Fait — anciennes URLs `?tab=` redirigées |
| — | Rendez-vous : consulter, déplacer, annuler, clôturer, rétablir (motif obligatoire, audité, cabinet + patient notifiés ; permission `appointment.manage`) | Lecture seule | ✅ Opérations › Rendez-vous |
| 5-7 | Accueil « Bonjour Amel », 4 KPI cliquables, « À traiter maintenant » | Partiel (stats décoratives) | ✅ Fait |
| 8-9 | Inbox unifiée, filtres, actions rapides, report (demain / lundi / semaine / date) | À créer | ✅ Fait |
| 10 | Modèle `operational_events` | À créer | ✅ Table + référence à l'entité source (`entity_type/entity_id`), pas de copie |
| 11-13 | Cabinet 360° (9 onglets, résumé, aujourd'hui, à surveiller) | Partiel (ligne simple) | ✅ Fait (drawer large, lien partageable `?cabinet=`) |
| 14 | Health score explicable | À créer | ✅ `server/health.mjs` (voir plus bas) |
| 15 | Notes internes cabinet (+ mentions) | À créer | ✅ `internal_notes` |
| 16 | Timeline universelle | À créer | ✅ Composant `Timeline` (cabinet, compte, ticket, vérification, élément) |
| 17 | Voir comme cabinet (lecture seule, bannière, journalisé) | À créer | ✅ `assist_sessions` + snapshot GET uniquement |
| 18-19 | Support Center, SLA, notes internes vs réponse publique | Partiel | ✅ `support_messages(visibility)` |
| 20 | Assignation, deadlines, vues Mon travail / Équipe / Non assignés / En retard | À créer | ✅ |
| 21 | Workflow de vérification + checklist | Partiel (booléen) | ✅ `verifications` ; `profiles.verified` reste la source lue par l'app |
| 22-23 | Finance Center (facturé/payé/à encaisser/retard, aging, table, alertes) | Partiel | ✅ |
| 24 | Séparation finance cabinets / revenus Amelib | Absent | ✅ Tables `plans, subscriptions, platform_invoices, platform_payments, credits` (vides, aucune migration de données) |
| 25-26 | CRM lifecycle + tracker onboarding | À créer | ✅ `cabinet_crm` ; onboarding calculé |
| 27 | Analytics | À créer | ✅ Adoption, cabinets, opérations, support, finance |
| 28-29 | Recherche universelle + palette ⌘K / Ctrl K | À créer | ✅ Groupes filtrés par permissions, jokers échappés |
| 30 | Saved views | À créer | ✅ Vues intégrées + vues perso/partagées (`saved_views`) |
| 31-32 | Actions rapides `•••`, bulk actions avec résumé + confirmation | À créer | ✅ |
| 33 | Automations explicables et auditées | À créer | ✅ 6 règles + notification critique (`server/automations.mjs`) |
| 34 | Daily brief déterministe | À créer | ✅ |
| 35 | Ask Amelib | À créer | ✅ **Bêta sans IA** : intentions reconnues → requêtes fixes sur données autorisées ; question inconnue = refus honnête |
| 36 | Notifications regroupées par cabinet + catégories | Partiel | ✅ |
| 37 | Drawers niveau 3 (contexte conservé) | À créer | ✅ URL-synchronisés, Échap ferme le plus haut |
| 39-40 | DataTable (tri, recherche, pagination, sélection, sticky, états) + cartes mobiles | À créer | ✅ |
| 41 | Audit enrichi, append-only | Partiel | ✅ colonnes `tenant/entity/before/after/reason/request_id/ip/user_agent/session_id/impersonated_by`, `UPDATE` bloqué par règle, secrets/données médicales expurgés |
| 42 | RBAC granulaire | À créer | ✅ 6 rôles internes, 20 permissions ; admin existant = Platform Owner (rétrocompatible) ; actions admin historiques gardées par permission |
| 43 | Confirmation + motif sur actions sensibles | Partiel | ✅ suspension, rôles, exports, assistance, refus de vérification, bulk |
| 44 | Need-to-know patients | Partiel | ✅ initiales, statut, date de pose, mutuelle (si `billing.read`), présence des pièces — aucune donnée clinique |
| 45 | Feature flags par cabinet | À créer | ✅ off / Amelib / pilotes / tous + forçage par cabinet ; `GET ?action=feature-flags` |
| 46 | System health | À créer | ✅ uniquement des mesures réelles (DB, API, automatisations, notifications, stockage) ; e-mail affiché « Non configuré » |
| 47-48, 50 | Empty states utiles, skeletons, erreurs + réessayer, accessibilité | — | ✅ |
| 54 | Détection d'anomalies, résumés IA, langage naturel | — | ⏳ Non livré volontairement : pas de couche IA fiable dans le projet |

## C. Impact

**Créés** : `server/{db,rbac,audit,health,automations,command-center,flags}.mjs`, `src/admin/*` (shell, pages, drawers, DataTable, palette, CSS scopé `.cc-app`), `scripts/migrations/2026-09-28-001-command-center{,.down}.sql`, `scripts/pg-neon.mjs`, `scripts/local-api.mjs`, `tests/{db,unit,command-center}.mjs`, ce document.

**Modifiés** : `api/index.mjs` (client SQL via `server/db.mjs`, garde RBAC des actions admin historiques, dispatch `cc-*`, suivi d'activité quotidien sur `session`, synchro `verifications` dans `admin-verify`), `src/AdminConsole.tsx` (réécrit en shell Command Center, mêmes props), `src/SupportPanel.tsx` (libellés des nouveaux statuts côté cabinet), `scripts/migrate.mjs` (applique `scripts/migrations/*.sql`), `tests/admin.mjs` et `tests/integration.mjs` (client SQL partagé), `package.json` (`pg` en devDependency, tests locaux uniquement).

**Supprimé** : `src/AdminCabinets.tsx` (remplacé par Cabinet 360° › Configuration, même endpoint `admin-account-update`).

**Non touchés** : `Portal.tsx`, pages publiques, SEO, `ProSuite.tsx`, `Workspace.tsx`, CSS publics, endpoints cabinet (sauf ajout additif `feature-flags`).

## D. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Déployer le code avant la migration | Les nouvelles tables sont lues avec repli (`adminContext`, suivi d'activité) mais `admin-verify` écrit désormais dans `verifications` : **appliquer la migration avant le déploiement**. |
| Statut par défaut des tickets passe à `new` | Libellés côté cabinet mis à jour ; l'action historique `support-update` accepte toujours `open/in_progress/resolved`. Rollback SQL fourni. |
| Règle `audit_log_no_update` | Bloque les `UPDATE` (aucun code n'en faisait). Les `DELETE` restent possibles pour l'effacement de compte et le nettoyage des tests. |
| Charge des agrégats cabinets | Sous-requêtes latérales indexées ; automatisations exécutées au plus une fois par minute dans une seule transaction. À surveiller au-delà de ~1 000 cabinets (passer à une vue matérialisée). |
| Isolation cabinet | Toutes les actions `cc-*` exigent `role = 'admin'` puis une permission interne ; les notes internes et messages `internal` ne sont lus par aucun endpoint cabinet (testé). |
| « Voir comme cabinet » | Pas d'usurpation de session : l'admin garde sa session, l'écran consomme un snapshot GET ; toute écriture reste dans l'espace de l'admin (testé). `impersonated_by` est prêt dans l'audit pour une évolution future explicite. |

## Health score (déterministe)

| Dimension | Max | Règle |
|---|---|---|
| Activation | 20 | ratio d'étapes d'onboarding × 20 |
| Utilisation | 25 | activité 14 j vs 14 j précédents : aucune → 0, baisse > 30 % → 12, sinon 25 |
| Finance | 20 | factures cabinet en retard : aucune → 20, 1–2 (< 60 j) → 12, sinon 5 |
| Support | 20 | tickets sur 14 j : 0 → 20, 1–2 → 14, 3+ → 6 ; ticket critique ouvert → plafonné à 4 |
| Engagement | 15 | dernière activité ≤ 7 j → 15, ≤ 14 → 9, ≤ 30 → 4, sinon 0 |

Statut : ≥ 75 Stable, 50–74 À surveiller, < 50 À risque. Chaque dimension produit une phrase « Pourquoi ? ». Activité = RDV, devis/factures, tâches, fiches patient, comptabilité, connexions et présence quotidienne (`account_activity`, suivi démarré avec cette version).

Onboarding : compte créé, informations cabinet (nom, ville, adresse, identifiant, téléphone), équipe invitée, agenda configuré, premier patient, premier devis, formation terminée (cochée par Amelib).

## Automatisations

| Règle | Condition → action |
|---|---|
| `verification_pending` | identifiant transmis, non vérifié → événement « À valider », urgent après 48 h |
| `support_open` | ticket nouveau/ouvert/en cours → événement support (sévérité = priorité, urgent si SLA dépassé) ; responsable synchronisé avec le ticket |
| `invoice_overdue` | facture envoyée non réglée après échéance → une alerte finance par cabinet (urgente > 30 j) |
| `cabinet_inactive` | aucune activité depuis 14 j → cabinet signalé à risque |
| `onboarding_stalled` | inscrit depuis > 7 j, étapes produit incomplètes → événement onboarding |
| `prosthesis_unready` | pose sous 2 j sans devis accepté ni facture → événement urgent |
| `support_critical_notify` | ticket critique → notification aux admins ayant accès au support |

Idempotentes (`dedupe_key`), résolues automatiquement quand la condition disparaît, rouvertes si elle réapparaît ; une résolution manuelle est respectée tant que la condition persiste. Seuils, activation et assignation par défaut modifiables dans Configuration (journalisé).

SLA de première réponse : critique 4 h, haute 24 h, normale 48 h, basse 96 h.

## Déploiement

1. Déployer : l'API applique elle-même les migrations en attente au premier appel (`server/bootstrap.mjs`, transaction verrouillée, suivi dans `platform_state.schema`). `node --env-file=.env.local scripts/migrate.mjs` reste possible manuellement.
2. Compte admin dédié (optionnel) : `AMELIB_BOOTSTRAP_ADMIN_EMAIL`, `AMELIB_BOOTSTRAP_ADMIN_NAME`, `AMELIB_BOOTSTRAP_ADMIN_PASSWORD_HASH` (hash scrypt produit par `server/security.mjs`, jamais le mot de passe) créent le compte ou réinitialisent son mot de passe quand le hash change ; un compte existant non-admin n'est jamais promu. Journalisé (`admin_bootstrap`).
3. Optionnel : attribuer des rôles internes dans Configuration › Équipe & rôles (sans action, tous les admins existants restent Platform Owner).

Rollback : redéployer la version précédente ; `scripts/migrations/2026-09-28-001-command-center.down.sql` (manuel) supprime uniquement les objets ajoutés.

## Tests

- `node tests/unit.mjs` — score de santé, onboarding, SLA, aging, expurgation de l'audit, matrice RBAC (sans base).
- `node --env-file=.env.local tests/command-center.mjs` — accès admin refusé aux cabinets, isolation inter-cabinets, RBAC interne, notes privées invisibles des cabinets, génération/idempotence/report/résolution des événements, calculs finance, 360° sans données cliniques, recherche filtrée, « Voir comme » en lecture seule, workflow de vérification, audit append-only, bulk, Ask Amelib fondé sur les données.
- En local sans Neon : `AMELIB_LOCAL_PG=1 DATABASE_URL=postgres://… node scripts/migrate.mjs` puis les tests ci-dessus ; `node scripts/local-api.mjs` sert `dist/` + `/api` sur http://localhost:3001.

## Suite proposée (non livrée)

- Réponse du cabinet dans le fil d'un ticket (aujourd'hui le cabinet ne voit que la dernière réponse publique) et pièces jointes support (colonne `attachments` prête).
- Tâche planifiée (Vercel Cron) pour exécuter les automatisations sans visite de l'admin.
- Facturation plateforme (écritures dans `platform_invoices`/`subscriptions`).
- Couche IA pour Ask Amelib / résumés, uniquement branchée sur les requêtes autorisées existantes.
