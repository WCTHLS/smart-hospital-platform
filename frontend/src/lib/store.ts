import { create } from "zustand";

/** Journey state shared across Check-in → Triage → Doctor Copilot. */
interface JourneyState {
  patientId: string | null;
  patientName: string | null;
  encounterId: string | null;
  token: string | null;
  department: string | null;
  set: (partial: Partial<Omit<JourneyState, "set" | "reset">>) => void;
  reset: () => void;
}

export const useJourney = create<JourneyState>((set) => ({
  patientId: null,
  patientName: null,
  encounterId: null,
  token: null,
  department: null,
  set: (partial) => set(partial),
  reset: () =>
    set({ patientId: null, patientName: null, encounterId: null, token: null, department: null }),
}));
