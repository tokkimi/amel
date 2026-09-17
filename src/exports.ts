import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { PatientRecord, Profile, money } from "./client";

export function downloadWorkbook(name: string, sheets: Record<string, Record<string, unknown>[]>) {
  const book = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([title, rows]) => XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Information: "Aucune donnée" }]), title.slice(0, 31)));
  XLSX.writeFile(book, `${name}.xlsx`, { compression: true });
}

export function downloadPatientPdf(patient: PatientRecord, profile: Profile, professionalName: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = 287;
  let y = 20;
  const line = (label: string, value?: string) => { if (!value) return; if (y > pageHeight) { pdf.addPage(); y = 20; } pdf.setFontSize(9); pdf.setTextColor(118, 129, 158); pdf.text(label.toUpperCase(), 18, y); pdf.setTextColor(34, 46, 77); pdf.setFontSize(11); const lines = pdf.splitTextToSize(value, 168); pdf.text(lines, 18, y + 6); y += 10 + lines.length * 5; };
  pdf.setFillColor(80, 88, 162); pdf.roundedRect(15, 12, 180, 34, 5, 5, "F");
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(19); pdf.text("SmilePec", 22, 27); pdf.setFontSize(10); pdf.text("FICHE PATIENT CONFIDENTIELLE", 22, 35);
  pdf.setTextColor(34, 46, 77); y = 58; pdf.setFontSize(20); pdf.text(patient.name, 18, y); y += 12;
  line("Cabinet", `${profile.clinic_name || professionalName}${profile.address ? " · " + profile.address : ""}`);
  line("Contact patient", [patient.email, patient.phone, patient.address].filter(Boolean).join(" · "));
  line("Date de naissance", patient.birth_date ? new Date(patient.birth_date).toLocaleDateString("fr-FR") : "");
  line("Pose de prothèse prévue", patient.prosthesis_date ? new Date(patient.prosthesis_date).toLocaleDateString("fr-FR") : "Non renseignée");
  line("Mutuelle", [patient.mutual_provider, patient.mutual_member_number && "Adhérent " + patient.mutual_member_number].filter(Boolean).join(" · "));
  line("Alertes médicales", patient.medical_alerts);
  line("Allergies", patient.allergies);
  line("Traitements en cours", patient.medications);
  line("Notes de suivi", patient.notes);
  line("Historique", `${patient.appointment_count} rendez-vous · ${patient.visits?.length || 0} note(s) clinique(s) · ${patient.media?.length || 0} média(s)`);
  pdf.setFontSize(8); pdf.setTextColor(118, 129, 158); pdf.text(`Généré le ${new Date().toLocaleString("fr-FR")} · Document confidentiel`, 18, 292);
  pdf.save(`fiche-patient-${patient.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`);
}

export const amount = (value: unknown) => money(Number(value || 0));
