# Suivi PEC - règles et recette

Les données financières PEC sont internes à SmilePec. Les cabinets reçoivent seulement les PDF transmis explicitement dans leur fil SmilePec, et éventuellement par e-mail lorsque ce canal est configuré.

## Calculs

- Total remboursé = part SS définitive + part mutuelle définitive.
- RÀC patient = max(0, devis final retenu - total remboursé).
- Gain = max(0, total remboursé - (devis initial - RÀC initial)). RÀC initial vide = 0.
- Supplément mutuelle = mutuelle définitive - mutuelle initiale : indicateur distinct.
- Montant récupéré, gain, facture et virement reçu sont enregistrés séparément.
- La validation d’une optimisation est explicite. Les changements de ses montants sources demandent une nouvelle validation.
- Les estimations sont exclues du bilan et du suivi des factures. Une nouvelle PEC peut référencer une estimation accordée du même cabinet.

## Dossier et documents

Le statut métier (attente, accord, refus, annulation) est indépendant de la colonne. Les dix colonnes incluent Accord estim. Un déplacement conserve pièces, notes et montants et reste possible avec des pièces manquantes.

Le brouillon peut être incomplet. La validation exige un devis et une mutuelle nominatifs. Jusqu’à 20 pièces par plan : devis, mutuelle, accord, estimation, facture, autres PDF et images. Limites actuelles : 1,2 Mo par pièce et 2,8 Mo au total, compatibles avec le transport API existant. Les fichiers complets sont chargés à l’ouverture du dossier, pas dans la liste des cartes.

Le commentaire automatique reprend les données courantes sans modifier les notes libres. Un accord est décrit comme enregistré seulement si une pièce Accord est présente ou si sa présence est explicitement confirmée.

## Facturation

Passer à PEC à facturer ne crée pas une facture. Numéro/date de facture, statut, date/montant de virement et relances sont conservés dans la fiche. Le montant facturé proposé est SS + mutuelle et peut être ajusté selon la règle du cabinet ; aucun tarif SmilePec n’est inventé. Date et numéro sont requis après À facturer ; date de virement requise pour En banque ou Rapprochement fait.

## Fiabilité et performance

- Lecture et écriture limitées au cabinet sélectionné, avec contrôle des droits côté serveur.
- Identifiants UUID permanents pour plans et pièces ; estimation d’origine conservée.
- Enregistrement et historique dans une même opération SQL.
- Protection contre l’écrasement d’une version modifiée, avec conservation de la précision PostgreSQL.
- Tableau paginé par 200 dossiers ; fichiers absents de sa réponse ; regroupement des cartes en une passe.
- Calculs partagés serveur/interface pour éviter les divergences.
- PDF en paysage, noms/plans complets, tableaux paginés avec en-têtes répétés. Le PDF envoyé est le même que celui de l’aperçu.

## Recette automatisée

`tests/pec-workflow.mjs` utilise une base locale isolée et des données fictives : exemple 1000/200/1000/150/850 => remboursé 1000, RÀC 0, gain 200 ; plusieurs pièces ; déplacement incomplet ; suppression puis validation bloquée ; notes préservées ; estimation non facturable et non comptée ; PEC liée ; facturation/virement distincts ; historique ; version concurrente ; absence de fichiers dans la liste ; isolation des montants ; transmission d’un vrai PDF dans le fil cabinet.

Les suites unit, stability, separation et command-center complètent cette recette. La prévisualisation `scripts/preview-amel.mjs` reste entièrement locale et n’utilise aucune donnée de production.
