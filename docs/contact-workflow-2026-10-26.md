# Parcours de prise de contact — 26 octobre 2026

Livré : bulle WhatsApp ; créneaux internes de 30 minutes ouverts par un administrateur ; sélection obligatoire ; réservation atomique du créneau ; demande persistante et notifications aux administrateurs ; récapitulatif éditable avec aperçu ; envoi du récapitulatif seul via Resend si l’expéditeur est activé ; choix récapitulatif seul ou avec devis à préparer ; suivi et paramètres manuel/automatique avec délai 48 h par défaut.

Limites explicites : aucun créneau inventé n’est publié. Tant que SmilePec n’a pas ouvert de créneaux, le visiteur est orienté vers WhatsApp. Google et Calendly ne sont PAS synchronisés : les comptes et applications OAuth doivent être raccordés. La validation DNS de l’expéditeur et SMILEPEC_MAIL_READY sont nécessaires avant tout envoi. Le mode automatique est un réglage préparé : le déclencheur d’envoi réel du devis et le planificateur de relance restent à raccorder ; aucune relance automatique n’est annoncée active. Un devis ne peut pas être joint depuis cette nouvelle fiche : utiliser la facturation existante. Le statut devis envoyé est manuel et ne constitue pas une preuve d’envoi.

Tests : tests/collaboration.mjs (réservation, conflit, persistance, refus non-admin, délai 48 h et erreur 503 si e-mail non configuré), tests/separation.mjs et build TypeScript/Vite.
