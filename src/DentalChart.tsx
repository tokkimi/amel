import { useMemo, useState } from "react";
import { Rotate3D, Save } from "lucide-react";

type Tooth = { status: string; note: string };
const upper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const lower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const states = [
  "Sain",
  "Surveillance",
  "Carie",
  "Couronne",
  "Implant",
  "Manquante",
  "Endodontie",
  "Facette",
  "Bridge",
];

export default function DentalChart({
  value = {},
  onSave,
}: {
  value?: Record<string, Tooth>;
  onSave: (value: Record<string, Tooth>) => void;
}) {
  const [chart, setChart] = useState<Record<string, Tooth>>(value || {});
  const [selected, setSelected] = useState("11");
  const [rotation, setRotation] = useState(0);
  const tooth = chart[selected] || { status: "Sain", note: "" };
  const count = useMemo(
    () =>
      Object.values(chart).filter((x) => x.status && x.status !== "Sain")
        .length,
    [chart],
  );
  const update = (patch: Partial<Tooth>) =>
    setChart({ ...chart, [selected]: { ...tooth, ...patch } });
  return (
    <section className="dental-workspace">
      <div className="dental-head">
        <div>
          <span className="eyebrow">ODONTOGRAMME INTERACTIF</span>
          <h3>
            Dossier dentaire · {count} dent{count > 1 ? "s" : ""} à suivre
          </h3>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => setRotation((r) => (r + 20) % 360)}
        >
          <Rotate3D /> Pivoter
        </button>
      </div>
      <div
        className="dental-stage"
        style={{ transform: `perspective(900px) rotateY(${rotation}deg)` }}
      >
        {[upper, lower].map((row, i) => (
          <div className={`tooth-row ${i ? "lower" : "upper"}`} key={i}>
            {row.map((n) => (
              <button
                type="button"
                key={n}
                className={`tooth ${selected === String(n) ? "selected" : ""} status-${(chart[n]?.status || "sain").toLowerCase()}`}
                onClick={() => setSelected(String(n))}
              >
                <span className="tooth-shape" />
                <b>{n}</b>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="tooth-editor glass">
        <strong>Dent {selected}</strong>
        <div className="tooth-statuses">
          {states.map((s) => (
            <button
              type="button"
              key={s}
              className={tooth.status === s ? "active" : ""}
              onClick={() => update({ status: s })}
            >
              {s}
            </button>
          ))}
        </div>
        <label>
          Observation clinique
          <textarea
            rows={3}
            value={tooth.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="Surface, mobilité, douleur, traitement prévu…"
          />
        </label>
        <button type="button" className="primary" onClick={() => onSave(chart)}>
          <Save /> Enregistrer l’odontogramme
        </button>
      </div>
    </section>
  );
}
