export const PEC_STAGES = ['PEC À FAIRE','ESTIMATION À FAIRE','PEC/ESTIM EN COURS','ACCORD PEC','DOSSIER EN ERREUR','PEC À FACTURER','PEC FACTURÉE','PEC PAYÉE','RAPPROCHEMENT FAIT'] as const;
export const normalizeStage = (stage?: string) => ({'À faire':'PEC À FAIRE','En cours':'PEC/ESTIM EN COURS','En attente':'ACCORD PEC','Terminé':'RAPPROCHEMENT FAIT'}[stage || ''] || stage || PEC_STAGES[0]);

export const PEC_GUIDANCE: Record<string,string> = {
 'PEC À FAIRE': 'Préparer la demande avec le devis nominatif et la mutuelle. Attribuer un responsable et renseigner les dates utiles.',
 'ESTIMATION À FAIRE': 'Renseigner le devis initial et préparer l’estimation du plan de traitement.',
 'PEC/ESTIM EN COURS': 'Suivre les échanges et noter les relances dans le commentaire de la fiche.',
 'ACCORD PEC': 'Vérifier l’accord reçu et le devis définitif. Utiliser « Facturer » pour envoyer ce plan dans « PEC À FACTURER ».',
 'DOSSIER EN ERREUR': 'Préciser le motif dans le commentaire, corriger les informations ou remplacer le document concerné, puis choisir le statut adapté.',
 'PEC À FACTURER': 'Préparer la facture correspondant au plan. La déplacer vers « PEC FACTURÉE » une fois la facture émise.',
 'PEC FACTURÉE': 'Suivre le règlement et les éventuelles relances. La déplacer vers « PEC PAYÉE » à réception du paiement.',
 'PEC PAYÉE': 'Renseigner le montant effectivement récupéré puis vérifier la correspondance avec le règlement reçu.',
 'RAPPROCHEMENT FAIT': 'Le suivi est terminé. Vérifier la date de rattachement et le praticien pour retrouver les montants dans le bon bilan.'
};
