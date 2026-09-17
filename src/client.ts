export type Account = {
  id: string;
  name: string;
  email: string;
  role: "patient" | "professional" | "worker" | "admin";
};
export type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  vat: number;
  active: boolean;
};
export type Profile = {
  specialty: string;
  city: string;
  address: string;
  bio: string;
  phone: string;
  languages: string;
  qualifications: string;
  identifier: string;
  price: number;
  published: boolean;
  verified: boolean;
  headline: string;
  contact_email: string;
  website: string;
  booking_url: string;
  calendar_provider: string;
  photo_data: string;
  logo_data: string;
  clinic_name: string;
  weekly_hours: Record<
    string,
    { enabled: boolean; start: string; end: string }
  >;
};
export type Professional = Profile & {
  id: string;
  name: string;
  role: string;
  next_slot: string | null;
  services: Service[];
};
export type Slot = {
  id: string;
  starts_at: string;
  duration: number;
  available: boolean;
};
export type Appointment = {
  id: string;
  slot_id: string;
  patient_id: string;
  professional_id: string;
  patient_name: string;
  professional_name: string;
  starts_at: string;
  duration: number;
  reason: string;
  status: string;
  address: string;
};
export type Entry = {
  id: string;
  label: string;
  amount: number;
  kind: string;
  paid: boolean;
  created_at: string;
};
export type PatientRecord = {
  patient_id: string;
  name: string;
  email: string;
  record_id: string;
  phone: string;
  record_status: string;
  tags: string;
  notes: string;
  last_appointment: string;
  appointment_count: number;
  birth_date?: string;
  address: string;
  social_security_number: string;
  mutual_provider: string;
  mutual_member_number: string;
  insurance_card_data: string;
  insurance_card_name: string;
  billing_document_data: string;
  billing_document_name: string;
  prosthesis_date?: string;
  medical_alerts: string;
  allergies: string;
  medications: string;
  dental_chart: Record<string, { status: string; note: string }>;
  media: {
    id: string;
    kind: string;
    title: string;
    data_url: string;
    created_at: string;
  }[];
  visits: {
    id: string;
    title: string;
    clinical_note: string;
    treatment_plan: string;
    created_at: string;
  }[];
};
export type BusinessDocument = {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_email: string;
  appointment_id?: string;
  doc_type: "quote" | "invoice";
  number: string;
  status: string;
  issue_date: string;
  due_date?: string;
  items: { label: string; quantity: number; unitPrice: number; vat: number }[];
  subtotal: number;
  tax: number;
  total: number;
  note: string;
  created_at: string;
  payment_provider: string;
  payment_method?: string;
  insurance_amount?: number;
  payment_details?: string;
  payment_url: string;
  pdf_data: string;
  pdf_name: string;
};
export type WorkTask = {
  id: string;
  title: string;
  description: string;
  stage: "À faire" | "En cours" | "En attente" | "Terminé";
  priority: string;
  due_at?: string;
  assignee: string;
  patient_id?: string;
  patient_name?: string;
  checklist: { id: string; text: string; done: boolean }[];
  attachments: { name: string; url: string }[];
};
export type Mission = {
  id: string;
  appointment_id?: string;
  assignee: string;
  title: string;
  address: string;
  status: string;
  eta: number;
  latitude?: number;
  longitude?: number;
  photo_data: string;
  updated_at: string;
};
export type Dashboard = {
  permissions?: string[];
  isOwner?: boolean;
  account: Account;
  profile: Profile;
  appointments: Appointment[];
  slots: Slot[];
  ledger: Entry[];
  patients: PatientRecord[];
  services: Service[];
  documents: BusinessDocument[];
  tasks: WorkTask[];
  missions: Mission[];
  members: {
    id: string;
    member_id: string;
    name: string;
    email: string;
    role: string;
    job_title: string;
    permissions: string[];
    active: boolean;
  }[];
};
export async function api<T = any>(action: string, data?: unknown): Promise<T> {
  const response = await fetch("/api?action=" + action, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Le service est indisponible.");
  return result;
}
export const roleLabel = (role: string) =>
  ({
    patient: "Patient",
    professional: "Praticien",
    worker: "Assistant de cabinet",
    admin: "Administrateur",
  })[role] || role;
export const homeFor = (role: string) =>
  role === "patient"
    ? "/patient"
    : role === "worker"
      ? "/intervenant"
      : role === "admin"
        ? "/admin"
        : "/pro";
export const dateFormat = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const money = (value: number) =>
  Number(value).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
