import { ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Empty } from "./ui";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
  mobile?: "title" | "subtitle" | "meta" | "hide"; // how the column appears in the card layout
};
// One table system for the whole admin: sticky header, sort, search, pagination, selection + bulk bar.
// Below 760px rows become cards (no endless horizontal scrolling).
export default function DataTable<T extends { id: string }>({
  rows, columns, search, onOpen, selectable = false, bulk, pageSize = 25, empty, toolbar, initialSort, label,
}: {
  rows: T[]; columns: Column<T>[]; search?: (row: T) => string; onOpen?: (row: T) => void; selectable?: boolean;
  bulk?: (selected: T[], clear: () => void) => ReactNode; pageSize?: number; empty?: ReactNode; toolbar?: ReactNode;
  initialSort?: { key: string; dir: 1 | -1 }; label: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setPage(0), [query, rows.length]);
  useEffect(() => setSelected((s) => new Set([...s].filter((id) => rows.some((r) => r.id === id)))), [rows]);
  const filtered = useMemo(() => {
    let list = search && query ? rows.filter((r) => search(r).toLowerCase().includes(query.toLowerCase())) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sort) list = [...list].sort((a, b) => { const x = col.sort!(a), y = col.sort!(b); return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir; });
    return list;
  }, [rows, query, sort, columns]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const allVisible = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = rows.filter((r) => selected.has(r.id));
  const title = columns.find((c) => c.mobile === "title") || columns[0];
  return <div className="cc-table-wrap">
    {(search || toolbar) && <div className="cc-table-toolbar">
      {search && <label className="cc-search-input"><Search size={15} aria-hidden /><input aria-label={"Rechercher — " + label} placeholder="Filtrer…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>}
      {toolbar}
    </div>}
    {selectable && chosen.length > 0 && bulk && <div className="cc-bulkbar" role="region" aria-label="Actions groupées"><strong>{chosen.length} sélectionné(s)</strong>{bulk(chosen, () => setSelected(new Set()))}<button className="cc-btn is-ghost" onClick={() => setSelected(new Set())}>Désélectionner</button></div>}
    {!filtered.length ? (empty || <Empty title="Aucun résultat ne correspond à ces filtres." action={query ? <button className="cc-btn" onClick={() => setQuery("")}>Réinitialiser la recherche</button> : undefined} icon="∅" />) : <>
      <table className="cc-table" aria-label={label}>
        <thead><tr>
          {selectable && <th className="cc-check"><input type="checkbox" aria-label="Tout sélectionner sur la page" checked={allVisible} onChange={() => setSelected((s) => { const n = new Set(s); visible.forEach((r) => (allVisible ? n.delete(r.id) : n.add(r.id))); return n; })} /></th>}
          {columns.map((c) => <th key={c.key} className={c.className} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
            {c.sort ? <button onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>{c.label}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button> : c.label}
          </th>)}
        </tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id} className={(onOpen ? "clickable " : "") + (selected.has(row.id) ? "selected" : "")} onClick={() => onOpen?.(row)} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => { if (onOpen && e.key === "Enter") onOpen(row); }}>
          {selectable && <td className="cc-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Sélectionner" checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>}
          {columns.map((c) => <td key={c.key} className={c.className} data-label={c.label}>{c.render(row)}</td>)}
        </tr>)}</tbody>
      </table>
      <ul className="cc-cards" aria-label={label}>{visible.map((row) => <li key={row.id} className={selected.has(row.id) ? "selected" : ""}>
        {selectable && <input type="checkbox" aria-label="Sélectionner" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />}
        <button className="cc-card-row" onClick={() => onOpen?.(row)} disabled={!onOpen}>
          <strong>{title.render(row)}</strong>
          {columns.filter((c) => c !== title && c.mobile !== "hide").map((c) => <span key={c.key} className={"m-" + (c.mobile || "meta")}><small>{c.label}</small>{c.render(row)}</span>)}
        </button>
      </li>)}</ul>
      {pages > 1 && <nav className="cc-pager" aria-label="Pagination"><button className="cc-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Page précédente"><ChevronLeft size={16} /></button><span>{page + 1} / {pages} · {filtered.length} lignes</span><button className="cc-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Page suivante"><ChevronRight size={16} /></button></nav>}
    </>}
  </div>;
}
