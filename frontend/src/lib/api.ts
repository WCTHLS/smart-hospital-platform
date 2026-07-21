const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    const validationMessage = Array.isArray(detail)
      ? detail.map((item) => {
          const field = Array.isArray(item?.loc) ? item.loc.filter((part: unknown) => part !== "body").join(".") : "";
          return [field, item?.msg].filter(Boolean).join(": ");
        }).filter(Boolean).join("; ")
      : "";
    super(typeof detail === "string" ? detail : validationMessage || `Request failed (${status})`);
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
const del = <T>(p: string) => request<T>(p, { method: "DELETE" });

export const api = {
  // meta / ai
  aiStatus: () => get<any>("/api/v1/ai/status"),
  intakePreview: (symptom_text: string, duration?: string) =>
    post<any>("/api/v1/ai/intake", { symptom_text, duration }),

  // journey
  checkin: (body: any) => post<any>("/api/v1/checkin", body),
  mobileProfiles: (mobile: string) => post<any>("/api/v1/checkin/mobile/profiles", { mobile }),
  registerBasicPatient: (body: any) => post<any>("/api/v1/patients/register-basic", body),
  registerPatient: (body: any) => post<any>("/api/v1/patients/register", body),
  updatePatientProfile: (patient_id: string, body: any) =>
    put<any>(`/api/v1/patients/${patient_id}/profile`, body),
  updatePatientProfilePhoto: (patient_id: string, profile_photo: string | null) =>
    put<any>(`/api/v1/patients/${patient_id}/profile-photo`, { profile_photo }),
  sendOtp: (mobile: string) => post<any>("/api/v1/identity/otp/send", { mobile }),
  verifyOtp: (mobile: string, code: string) => post<any>("/api/v1/identity/otp/verify", { mobile, code }),
  verifyIdentity: (method: string, value: string) =>
    post<any>("/api/v1/identity/verify", { method, value }),
  consent: (patient_id: string) => post<any>("/api/v1/consent", { patient_id }),
  todayAppointments: (patient_id: string) =>
    get<any>(`/api/v1/patients/${patient_id}/appointments/today`),
  hospitalTodayAppointments: () => get<any>("/api/v1/appointments/today"),
  upcomingAppointments: (patient_id: string) =>
    get<any>(`/api/v1/patients/${patient_id}/appointments/upcoming`),
  appointmentSlots: (body: any) => post<any>("/api/v1/appointments/slots", body),
  bookAppointment: (body: any) => post<any>("/api/v1/appointments/book", body),
  cancelAppointment: (appointment_id: string) => post<any>(`/api/v1/appointments/${appointment_id}/cancel`),
  patient360: (patient_id: string) => get<any>(`/api/v1/patients/${patient_id}/patient360`),
  generateSummary: (patient_id: string) => post<any>(`/api/v1/patients/${patient_id}/summary`),
  addPatientIssue: (patient_id: string, body: { issue_name: string; onset_info?: string }) =>
    post<any>(`/api/v1/patients/${patient_id}/issues`, body),
  doctors: () => get<any[]>("/api/v1/doctors"),
  doctorEncounters: (doctor_id: string) => get<any[]>(`/api/v1/doctors/${doctor_id}/encounters`),
  updateDoctorAvailability: (doctor_id: string, available: boolean) =>
    put<any>(`/api/v1/doctors/${doctor_id}/availability`, { available }),
  triageStaff: () => get<any[]>("/api/v1/triage/staff"),
  verifyTriagePin: (staff_id: string, access_pin: string) =>
    post<any>("/api/v1/triage/verify-pin", { staff_id, access_pin }),
  pendingTriageEncounters: () => get<any[]>("/api/v1/triage/encounters"),
  triage: (encounter_id: string, body: any) =>
    post<any>(`/api/v1/encounters/${encounter_id}/triage`, body),
  triageQueue: () => get<any>("/api/v1/triage/queue"),
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
  confirmLabOrder: (lab_order_id: string) =>
    post<any>(`/api/v1/lab-orders/${lab_order_id}/confirm`),
  labCheckIn: (body: any) => post<any>("/api/v1/labs/check-in", body),
  encounterLab: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/lab`),
  suggestLabOrders: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/lab/suggest`),
  labOrders: () => get<any>("/api/v1/lab-orders"),
  submitLabResults: (lab_order_id: string, body: any) =>
    post<any>(`/api/v1/lab-orders/${lab_order_id}/submit-results`, body),
  createRx: (body: any) => post<any>("/api/v1/prescriptions", body),
  getFormularyGuidance: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/formulary-guidance`),
  approveRx: (rx_id: string, body: any) => post<any>(`/api/v1/prescriptions/${rx_id}/approve`, body),
  stock: (drug?: string) => get<any>(`/api/v1/pharmacy/stock${drug ? `?drug=${encodeURIComponent(drug)}` : ""}`),
  pharmacyLookup: (search: string) => get<any>(`/api/v1/pharmacy/lookup?search=${encodeURIComponent(search)}`),
  dispensePrescription: (rx_id: string) => post<any>(`/api/v1/pharmacy/dispense/${rx_id}`),
  releaseExpiredReservations: () => post<any>("/api/v1/pharmacy/release-expired-reservations"),
  payPrescription: (rx_id: string) => post<any>(`/api/v1/pharmacy/prescriptions/${rx_id}/pay`),
  readyPrescription: (rx_id: string) => post<any>(`/api/v1/pharmacy/prescriptions/${rx_id}/ready`),
  pickupPrescription: (rx_id: string) => post<any>(`/api/v1/pharmacy/prescriptions/${rx_id}/pickup`),
  prepaidPrescriptions: () => get<any>("/api/v1/pharmacy/prepaid"),

  // billing
  invoice: (encounter_id: string) => get<any>(`/api/v1/encounters/${encounter_id}/invoice`),
  pay: (invoice_id: string, method: string) => post<any>(`/api/v1/invoices/${invoice_id}/pay`, { method }),
  createRazorpayOrder: (body: {
    patient_id: string;
    doctor_id: string;
    scheduled_start: string;
    scheduled_end: string;
    reason: string;
    specialty: string;
    appointment_type: string;
    channel: string;
    checkout_email: string;
  }) =>
    post<any>("/api/v1/payments/razorpay/create-order", body),
  verifyRazorpayPayment: (body: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => post<any>("/api/v1/payments/razorpay/verify-payment", body),
  createRazorpayLabOrder: (body: {
    patient_id: string;
    amount: number;
    lab_order_ids: string[];
  }) => post<any>("/api/v1/payments/razorpay/create-lab-order", body),
  verifyRazorpayLabPayment: (body: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    lab_order_ids: string[];
  }) => post<any>("/api/v1/payments/razorpay/verify-lab-payment", body),
  createRazorpayPrescriptionOrder: (body: {
    patient_id: string;
    amount: number;
    rx_id: string;
  }) => post<any>("/api/v1/payments/razorpay/create-prescription-order", body),
  verifyRazorpayPrescriptionPayment: (body: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    rx_id: string;
  }) => post<any>("/api/v1/payments/razorpay/verify-prescription-payment", body),
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
  removeDoctor: (doctor_id: string) => del<any>(`/api/v1/admin/doctors/${doctor_id}`),
  verifyDoctorPin: (doctor_id: string, access_pin: string) => post<any>("/api/v1/doctors/verify-pin", { doctor_id, access_pin }),
  listDoctorSchedule: (doctor_id: string) => get<any[]>(`/api/v1/admin/doctors/${doctor_id}/schedule`),
  updateDoctorSchedule: (doctor_id: string, body: any[]) => post<any>(`/api/v1/admin/doctors/${doctor_id}/schedule`, body),

  // revisit & econsult
  uploadPatientDocument: (patientId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`${BASE}/api/v1/patients/${patientId}/upload-document`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new ApiError(res.status, data?.detail ?? data);
      }
      return data;
    });
  },
  bookRevisit: (patientId: string, body: any) => post<any>(`/api/v1/patients/${patientId}/revisit/book`, body),
  requestEconsult: (patientId: string, body: any) => post<any>(`/api/v1/patients/${patientId}/econsult/request`, body),
  localAnalyzeLabOrder: (labOrderId: string, file?: File) => {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    return fetch(`${BASE}/api/v1/labs/orders/${labOrderId}/local-analyze`, {
      method: "POST",
      body: formData,
    }).then(async (res) => {
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
      return data;
    });
  },
  cancelLabOrder: (labOrderId: string) => del<any>(`/api/v1/labs/orders/${labOrderId}`),
  listLabSchedules: (category: string = "ALL") => get<any[]>(`/api/v1/admin/lab-schedules?category=${category}`),
  updateLabSchedules: (body: any[]) => post<any>(`/api/v1/admin/lab-schedules`, body),
};
