# Configuration Stripe SEPA - SmilePec

Les clients peuvent être préenregistrés sans Stripe. Aucun prélèvement n’est activé tant que la configuration n’est pas complète.

1. Créer et vérifier le compte Stripe SmilePec, activer SEPA Direct Debit et renseigner les coordonnées de facturation et le logo dans Stripe.
2. Configurer dans Vercel (jamais dans le code) : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PUBLIC_APP_URL=https://amelib.vercel.app, RESEND_API_KEY et BILLING_FROM_EMAIL. Le domaine expéditeur doit être vérifié dans Resend.
3. Ajouter le webhook https://amelib.vercel.app/api/stripe-webhook avec checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.finalized, invoice.paid et invoice.payment_failed.
4. Tester d’abord avec les clés de test et les coordonnées bancaires de test officielles Stripe : signature du mandat, paiement différé, échec, renouvellement, doublons de webhook et réception du PDF.
5. En comptabilité, enregistrer un client et son montant mensuel TTC. L’administrateur prépare le lien de mandat à transmettre au client. Seul le client signe et autorise le prélèvement sur Stripe.
6. Stripe génère les factures mensuelles. Le webhook enregistre leur état et Resend transmet le PDF à l’adresse de facturation. L’état payé n’est jamais déduit de la seule signature du mandat.

La première version utilise un montant mensuel TTC fixe. Les changements d’un abonnement existant et sa résiliation se gèrent dans Stripe. Configurer la TVA et les mentions applicables dans Stripe avant toute facturation réelle. Aucun client réel n’a été prélevé ou contacté pendant le développement.
