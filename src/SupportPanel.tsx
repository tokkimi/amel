import { useEffect, useState } from "react";
import { api, dateFormat } from "./client";
import DocumentPreview from "./DocumentPreview";

type FileAttachment = { name: string; data: string };
const readAttachments = async (files: FileList | null): Promise<FileAttachment[]> => Promise.all(Array.from(files || []).slice(0, 5).map((file) => new Promise<FileAttachment>((resolve, reject) => {
  if (file.size > 3300000) return reject(new Error(file.name + " dépasse 3 Mo."));
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) return reject(new Error("Ajoutez uniquement un PDF, PNG, JPEG ou WEBP."));
  const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, data: String(reader.result) }); reader.onerror = () => reject(new Error("Lecture du fichier impossible.")); reader.readAsDataURL(file);
})));
const Attachments = ({ items }: { items: FileAttachment[] }) => items?.length ? <ul className="support-attachments">{items.map((file, i) => <li key={i}><a href={file.data} download={file.name} target="_blank" rel="noreferrer">{file.name}</a></li>)}</ul> : null;

export default function SupportPanel({ admin = false }: { admin?: boolean }) {
  const [tickets, setTickets] = useState<any[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [filter, setFilter] = useState("all");
  const [pending, setPending] = useState<{ ticket: string; body: string; attachments: FileAttachment[] } | null>(null);
  const load = () => api("support").then((d) => setTickets(d.tickets)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const send = async (action: string, body: unknown) => { setBusy(true); setError(""); try { await api(action, body); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const visible = tickets.filter((t) => filter === "all" || t.status === filter || (filter === "open" && t.status === "new") || (filter === "resolved" && t.status === "closed"));
  const transmit = async () => { if (!pending) return; await send("support-reply", { id: pending.ticket, body: pending.body, attachments: pending.attachments }); setPending(null); };
  return <section className="glass panel">
    <h2>{admin ? "Demandes & accompagnement SmilePec" : "Contacter SmilePec"}</h2>
    <p>{admin ? "Répondez aux demandes et suivez leur résolution." : "Tiers payant, impayés, aide sur votre cabinet : retrouvez ici les réponses et les pièces demandées par SmilePec."}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!admin && <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void send("support-create", { subject: f.get("subject"), body: f.get("body") }); }}>
      <label>Sujet<input name="subject" required maxLength={180} /></label><label>Votre demande<textarea name="body" required maxLength={5000} rows={4} /></label><button className="primary" disabled={busy}>Envoyer à SmilePec</button>
    </form>}
    <label>Afficher<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Toutes les demandes</option><option value="open">À traiter</option><option value="in_progress">En cours</option><option value="resolved">Résolues</option></select></label>
    {visible.map((t) => <article className="support-ticket" key={t.id}>
      <h3>{t.subject}</h3><small>{t.name || "Votre demande"} · {dateFormat(t.created_at)}</small><p style={{ whiteSpace: "pre-wrap" }}>{t.body}</p>
      {admin ? <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void send("support-update", { id: t.id, status: f.get("status"), admin_reply: f.get("reply") }); }}><label>Réponse<textarea name="reply" rows={3} defaultValue={t.admin_reply} /></label><label>Statut<select name="status" defaultValue={t.status}><option value="open">À traiter</option><option value="in_progress">En cours</option><option value="resolved">Résolue</option></select></label><button disabled={busy} className="secondary">Enregistrer la réponse</button></form> : <>
        <span className="badge">{({ new: "Envoyée", open: "À traiter", in_progress: "En cours", waiting_customer: "Informations ou documents demandés", resolved: "Résolue", closed: "Clôturée" } as Record<string, string>)[t.status] || t.status}</span>
        {t.admin_reply && !t.messages?.length && <blockquote>{t.admin_reply}</blockquote>}
        {t.messages?.map((m: any) => <blockquote key={m.id}><strong>{m.author}</strong><small> · {dateFormat(m.created_at)}</small><p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p><Attachments items={m.attachments || []} /></blockquote>)}
        <form onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; try { const body = String(new FormData(form).get("body") || ""); const files = (form.elements.namedItem("attachments") as HTMLInputElement)?.files; const attachments = await readAttachments(files); if (attachments.length) setPending({ ticket: t.id, body, attachments }); else { await send("support-reply", { id: t.id, body, attachments: [] }); form.reset(); } } catch (err) { setError((err as Error).message); } }}>
          <label>Répondre à SmilePec<textarea name="body" maxLength={5000} rows={3} /></label><label>Joindre des documents (PDF, PNG, JPEG ou WEBP, 3 Mo par fichier)<input name="attachments" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" /></label><button className="secondary" disabled={busy}>Transmettre à SmilePec</button>
        </form>
      </>}
    </article>)}
    {!tickets.length && <p className="empty">Aucune demande pour le moment.</p>}
    {pending && <div className="modal-backdrop"><section className="modal pro-modal glass document-preview-modal"><button className="icon-button close" onClick={() => setPending(null)} aria-label="Fermer">×</button><div className="eyebrow">TRANSMISSION À SMILEPEC</div><h2>Vérifier avant de transmettre</h2><p>Ces documents seront envoyés dans ce fil à l’équipe SmilePec.</p>{pending.attachments.map((file, index) => <DocumentPreview key={file.name + index} data={file.data} name={file.name} title={"Aperçu " + (index + 1)} />)}<div className="document-preview-actions"><button className="primary" disabled={busy} onClick={() => void transmit()}>{busy ? "Transmission en cours…" : "Confirmer la transmission"}</button><button className="secondary" disabled={busy} onClick={() => setPending(null)}>Modifier</button></div></section></div>}
  </section>;
}
