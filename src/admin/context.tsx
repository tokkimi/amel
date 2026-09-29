import { createContext, useContext } from "react";
import type { ConfirmRequest } from "./ui";

export type Me = {
  account: { id: string; name: string; email: string };
  role: string; role_label: string; permissions: string[];
  team: { id: string; name: string; email: string; internal_role: string }[];
  roles: { key: string; label: string; permissions: string[] }[];
  assist: { id: string; cabinet_id: string; cabinet_name: string; reason: string; started_at: string } | null;
};
export type Section = "Dossiers PEC" | "Accueil" | "Inbox" | "Cabinets" | "Opérations" | "Finance" | "Support" | "Réseau" | "Analytics" | "Sécurité & Audit" | "Configuration";
export type CC = {
  me: Me;
  can: (permission: string) => boolean;
  go: (section: Section, sub?: string) => void;
  open: (kind: "cabinet" | "ticket" | "event", id: string) => void;
  confirm: (request: ConfirmRequest) => void;
  toast: (message: string) => void;
  createTask: (preset?: { cabinet_id?: string; cabinet_name?: string; title?: string }) => void;
  startAssist: (cabinet: { id: string; name: string }) => void;
  version: number; // bumps after mutations so mounted views refresh
  bump: () => void;
};
export const CommandContext = createContext<CC | null>(null);
export const useCC = () => { const c = useContext(CommandContext); if (!c) throw new Error("CommandContext missing"); return c; };
