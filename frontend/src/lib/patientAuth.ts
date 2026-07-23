export type PortalPatient = {
  patient_id: string;
  name: string;
  mobile?: string;
  mrn?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  email?: string;
  gender?: string;
  blood_group?: string;
  address?: string;
  profile_photo?: string;
};

const SESSION_KEY = "portal_patient";

export function getPortalPatient(): PortalPatient | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (value) return JSON.parse(value);
    const patient_id = localStorage.getItem("portal_patient_id");
    const name = localStorage.getItem("portal_patient_name");
    return patient_id && name ? { patient_id, name } : null;
  } catch {
    return null;
  }
}

export function savePortalPatient(patient: PortalPatient) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(patient));
  // Keep the old keys during the portal migration for existing consumers.
  localStorage.setItem("portal_patient_id", patient.patient_id);
  localStorage.setItem("portal_patient_name", patient.name);
}

export function clearPortalPatient() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("portal_patient_id");
  localStorage.removeItem("portal_patient_name");
}
