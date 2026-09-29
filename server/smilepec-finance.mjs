// SmilePec revenue is sourced only from invoices to its cabinet clients.
export async function smilepecFinance(sql){
 const [totals]=await sql`SELECT count(DISTINCT c.id)::int AS clients,count(DISTINCT c.id) FILTER(WHERE c.subscription_status IN('active','trialing','past_due'))::int AS subscriptions,
 coalesce(sum(i.amount_due) FILTER(WHERE i.status IN('open','paid','uncollectible')),0)::float/100 AS invoiced,
 coalesce(sum(i.amount_paid),0)::float/100 AS collected,
 coalesce(sum(greatest(i.amount_due-coalesce(i.amount_paid,0),0)) FILTER(WHERE i.status IN('open','uncollectible')),0)::float/100 AS outstanding,
 count(i.stripe_invoice_id) FILTER(WHERE i.status='uncollectible' OR (i.status='open' AND c.subscription_status='past_due'))::int AS overdue_count,
 coalesce(sum(greatest(i.amount_due-coalesce(i.amount_paid,0),0)) FILTER(WHERE i.status='uncollectible' OR (i.status='open' AND c.subscription_status='past_due')),0)::float/100 AS overdue
 FROM billing_clients c JOIN accounts a ON a.id=c.owner_id AND a.role='admin' LEFT JOIN billing_invoices i ON i.client_id=c.id`;
 const monthly=await sql`SELECT to_char(i.issued_at,'YYYY-MM') AS month,coalesce(sum(i.amount_due) FILTER(WHERE i.status IN('open','paid','uncollectible')),0)::float/100 AS invoiced,coalesce(sum(i.amount_paid),0)::float/100 AS paid FROM billing_invoices i JOIN billing_clients c ON c.id=i.client_id JOIN accounts a ON a.id=c.owner_id AND a.role='admin' WHERE i.issued_at>=date_trunc('month',current_date)-interval '11 months' GROUP BY 1 ORDER BY 1`;
 return {...totals,plans:totals.clients,paid:totals.collected,monthly};
}
