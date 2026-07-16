import { create } from "zustand";

/** Journey state shared across Check-in → Triage → Doctor Copilot. */
export type Role = "patient" | "nurse" | "doctor" | "admin" | "lab" | "receptionist" | "pharmacist";

interface JourneyState {
  patientId: string | null;
  patientName: string | null;
  encounterId: string | null;
  token: string | null;
  department: string | null;
  chiefComplaint: string | null;
  activeRole: Role;
  setRole: (role: Role) => void;
  set: (partial: Partial<Omit<JourneyState, "set" | "reset" | "setRole">>) => void;
  reset: () => void;
}

export const useJourney = create<JourneyState>((set) => ({
  patientId: null,
  patientName: null,
  encounterId: null,
  token: null,
  department: null,
  chiefComplaint: null,
  activeRole: "patient",
  setRole: (role) => set({ activeRole: role }),
  set: (partial) => set(partial),
  reset: () =>
    set({ patientId: null, patientName: null, encounterId: null, token: null, department: null, chiefComplaint: null }),
}));
