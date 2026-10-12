type DocumentPreviewProps = {
  data: string;
  name: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  busy?: boolean;
};

export default function DocumentPreview({ data, name, title = "Aperçu du document", description, confirmLabel, onConfirm, onCancel, busy }: DocumentPreviewProps) {
  const isImage = data.startsWith("data:image/");
  return <section className="document-preview" aria-label={title}>
    <header><div><h3>{title}</h3><p>{description || "Vérifiez le contenu et le destinataire avant toute transmission."}</p></div><a href={data} download={name} target="_blank" rel="noreferrer">Ouvrir</a></header>
    <p className="document-preview-name">{name}</p>
    <div className="document-preview-frame">
      {isImage ? <img src={data} alt={"Aperçu de " + name} /> : <iframe src={data} title={"Aperçu de " + name} />}
    </div>
    {(onConfirm || onCancel) && <footer>
      {onConfirm && <button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? "Transmission en cours…" : confirmLabel || "Confirmer l’envoi"}</button>}
      {onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Annuler</button>}
    </footer>}
  </section>;
}
