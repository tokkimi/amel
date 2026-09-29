# Reprise de l’espace central SmilePec

Base conservée : version-reelle, fd9b8e0, déploiement du 19 septembre. Aucun déploiement de production autorisé.

## Périmètres
- Amel : cabinets clients, prestations et factures SmilePec, équipe interne, dossiers PEC traités par cabinet, demandes et suivi commercial.
- Cabinets : patients, agenda, documents et factures patients, équipe cabinet, conversation avec SmilePec.
- Assistance : lecture seule explicite et journalisée. Ne transforme pas un administrateur en dentiste.

## Audit et mapping
| Besoin | État repris | Correction |
|---|---|---|
| Accueil, Inbox, recherche, notes, CRM et support | Présents sur branche Command Center | Conserver et tester les permissions |
| PEC et sous-plans | Présents au 19 septembre | Intégrer dans une page admin dédiée avec cabinet obligatoire |
| Finance SmilePec | Clients/SEPA existants, nouvelles tables plateforme séparées | Reprendre les clients et factures existants; exclure les factures patients des revenus |
| Finance des cabinets | Agrégats existants | Consultation explicitement désignée, distincte de la comptabilité SmilePec |
| Conversation cabinet-Amel | Dernière réponse seulement côté cabinet | Afficher le fil public et permettre une réponse; exclure les notes internes côté API |
| Permissions | RBAC central ajouté mais anciennes routes contournables | Verrouiller aussi les accès historiques et les outils PEC |
| Migrations | Exécution automatique à chaque première requête | Désactivée par défaut; validation sur base locale isolée |
| Site public et outils cabinet | Version du 19 septembre | Préserver, sauf correction de la facturation SmilePec mal placée |

## Vérification
Compilation, tests des calculs et rôles, intégration SQL isolée, navigation et affichage mobile. Les comptes de démonstration locaux ne doivent jamais être créés en production.

## Publication
Préparer une prévisualisation locale et sauvegarder la branche. Demander l’accord sur le résultat avant toute mise en production ou migration de la base de production.
