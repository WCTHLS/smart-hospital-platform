const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>(p);
const post = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined });

export const api = {
  // meta / ai
  aiStatus: () => get<any>("/api/v1/ai/status"),
  intakePreview: (symptom_text: string, duration?: string) =>
    post<any>("/api/v1/ai/intake", { symptom_text, duration }),

  // journey
  checkin: (body: any) => post<any>("/api/v1/checkin", body),
  verifyIdentity: (method: string, value: string) =>
    post<any>("/api/v1/identity/verify", { method, value }),
  consent: (patient_id: string) => post<any>("/api/v1/consent", { patient_id }),
  patient360: (patient_id: string) => get<any>(`/api/v1/patients/${patient_id}/patient360`),
  generateSummary: (patient_id: string) => post<any>(`/api/v1/patients/${patient_id}/summary`),
  doctors: () => get<any[]>("/api/v1/doctors"),
  doctorEncounters: (doctor_id: string) => get<any[]>(`/api/v1/doctors/${doctor_id}/encounters`),
  updateDoctorAvailability: (doctor_id: string, available: boolean) =>
    put<any>(`/api/v1/doctors/${doctor_id}/availability`, { available }),
  triage: (encounter_id: string, body: any) =>
    post<any>(`/api/v1/encounters/${encounter_id}/triage`, body),
  encounter: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}`),
  updateEncounterNotes: (encounter_id: string, notes: string) =>
    post<any>(`/api/v1/encounters/${encounter_id}/notes-advice`, { notes }),

  // clinical
  ambient: (encounter_id: string, transcript: string) =>
    post<any>(`/api/v1/encounters/${encounter_id}/ambient`, { encounter_id, transcript }),
  approveNote: (note_id: string, body: any) => post<any>(`/api/v1/notes/${note_id}/approve`, body),
  createLabOrders: (encounter_id: string, tests: string[]) =>
    post<any>("/api/v1/lab-orders", { encounter_id, tests }),
  publishResult: (lab_order_id: string) =>
    post<any>(`/api/v1/lab-orders/${lab_order_id}/publish-result`),
  encounterLab: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/lab`),
  suggestLabOrders: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/lab/suggest`),
  labOrders: () => get<any>("/api/v1/lab-orders"),
  submitLabResults: (lab_order_id: string, body: any) =>
    post<any>(`/api/v1/lab-orders/${lab_order_id}/submit-results`, body),
  createRx: (body: any) => post<any>("/api/v1/prescriptions", body),
  approveRx: (rx_id: string, body: any) => post<any>(`/api/v1/prescriptions/${rx_id}/approve`, body),
  stock: (drug?: string) => get<any>(`/api/v1/pharmacy/stock${drug ? `?drug=${encodeURIComponent(drug)}` : ""}`),

  // billing
  invoice: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/invoice`),
  pay: (invoice_id: string, method: string) => post<any>(`/api/v1/invoices/${invoice_id}/pay`, { method }),
  claim: (invoice_id: string, body: any) => post<any>(`/api/v1/invoices/${invoice_id}/claim`, body),
  discharge: (encounter_id: string) => put<any>(`/api/v1/encounters/${encounter_id}/discharge`),

  // command center
  metrics: () => get<any>("/api/v1/command-center/metrics"),
  events: (limit = 40) => get<any>(`/api/v1/events?limit=${limit}`),
  audit: (limit = 30) => get<any>(`/api/v1/audit?limit=${limit}`),

  // admin & auth
  adminDoctors: () => get<any[]>("/api/v1/admin/doctors"),
  registerDoctor: (body: any) => post<any>("/api/v1/admin/doctors", body),
  updateDoctor: (doctor_id: string, body: any) => put<any>(`/api/v1/admin/doctors/${doctor_id}`, body),
  verifyDoctorPin: (doctor_id: string, access_pin: string) => post<any>("/api/v1/doctors/verify-pin", { doctor_id, access_pin }),
  listDoctorSchedule: (doctor_id: string) => get<any[]>(`/api/v1/admin/doctors/${doctor_id}/schedule`),
  updateDoctorSchedule: (doctor_id: string, body: any[]) => post<any>(`/api/v1/admin/doctors/${doctor_id}/schedule`, body),
};
