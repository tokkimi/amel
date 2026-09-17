import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api, dateFormat } from "./client";

type Notice = { id: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const load = () => api<{ notifications: Notice[]; unread: number }>("notifications").then((result) => { setItems(result.notifications); setUnread(result.unread); }).catch(() => undefined);
  useEffect(() => { load(); const timer = window.setInterval(load, 20000); return () => window.clearInterval(timer); }, []);
  const readAll = async () => { await api("notification-read", {}); setItems((old) => old.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))); setUnread(0); };
  return <div className="notification-center">
    <button className="icon-button notification-bell" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) load(); }}><Bell size={18} />{unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <section className="notification-popover" aria-label="Vos notifications">
      <div><strong>Notifications</strong>{unread > 0 && <button className="text-button" onClick={readAll}><CheckCheck size={14} />Tout lire</button>}</div>
      {items.length ? items.map((item) => <button key={item.id} className={item.read_at ? "notification-item" : "notification-item unread"} onClick={async () => { if (!item.read_at) { await api("notification-read", { id: item.id }); setUnread((n) => Math.max(0, n - 1)); setItems((old) => old.map((x) => x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x)); } if (item.href) location.assign(item.href); }}><strong>{item.title}</strong><span>{item.body}</span><small>{dateFormat(item.created_at)}</small></button>) : <p className="empty">Aucune notification.</p>}
    </section>}
  </div>;
}
