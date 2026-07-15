import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Calendar, CreditCard, Shield, X, Scan } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Field } from "../../../components/ui";

interface WalkInModalProps {
  onClose: () => void;
  onSuccess: (tokenNumber: string, patientName: string) => void;
}

export default function WalkInModal({ onClose, onSuccess }: WalkInModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Patient details
  const [mobile, setMobile] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("MALE");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [address, setAddress] = useState("");
  const [allergies, setAllergies] = useState<string>("");

  // Existing profiles lookup
  const [existingProfiles, setExistingProfiles] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Step 2: Doctor and Slots
  const { data: doctors } = useQuery({
    queryKey: ["reception-doctors"],
    queryFn: api.doctors,
  });

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [reason, setReason] = useState("General consultation");
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  // Step 3: Payment
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "UPI" | "CARD">("CASH");

  // Lookup existing profiles by mobile
  const handleLookup = async () => {
    if (!mobile || mobile.length < 10) return;
    try {
      setError("");
      setBusy(true);
      const res = await api.mobileProfiles(mobile);
      if (res.profiles && res.profiles.length > 0) {
        setExistingProfiles(res.profiles);
      } else {
        setExistingProfiles([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to lookup profiles");
    } finally {
      setBusy(false);
    }
  };

  // Trigger lookup automatically when 10-digit mobile is typed
  useEffect(() => {
    if (mobile.length === 10) {
      handleLookup();
    } else {
      setExistingProfiles([]);
      setSelectedPatientId(null);
    }
  }, [mobile]);

  // Handle existing patient selection
  const handleSelectPatient = (p: any) => {
    setSelectedPatientId(p.patient_id);
    setFirstName(p.first_name);
    setLastName(p.last_name || "");
    setDob(p.dob ? p.dob.substring(0, 10) : "");
    setEmail(p.email || "");
    setGender(p.gender || "MALE");
    setBloodGroup(p.blood_group || "O+");
    setAddress(p.address || "");
    setStep(2);
  };

  // Simulate ABHA Card Scan
  const handleAbhaScan = () => {
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
    setMobile(`98765${randomSuffix}`);
    setFirstName("Amit");
    setLastName("Sharma");
    setDob("1988-05-15");
    setEmail("amit.sharma@example.com");
    setGender("MALE");
    setBloodGroup("O+");
    setAddress("123 Green Glen Layout, HSR Sector 2, Bengaluru, Karnataka");
    setAllergies("Penicillin");
    setReason("Fever and cough for 3 days");
    setError("");
  };

  // Fetch slots when doctor is selected
  useEffect(() => {
    if (selectedDoctorId && doctors) {
      const doc = doctors.find((d: any) => d.doctor_id === selectedDoctorId);
      setSelectedDoctor(doc);
      setSelectedSlot(null);

      const fetchSlots = async () => {
        try {
          setError("");
          const todayStr = new Date().toISOString().substring(0, 10);
          const res = await api.appointmentSlots({
            doctor_id: selectedDoctorId,
            appointment_date: todayStr,
            reason: reason,
          });
          setSlots(res.slots || []);
        } catch (err: any) {
          setError("Failed to fetch slots");
        }
      };
      fetchSlots();
    } else {
      setSelectedDoctor(null);
      setSlots([]);
    }
  }, [selectedDoctorId, doctors]);

  // Complete Walk-in check-in
  const handleSubmit = async () => {
    if (!selectedSlot) {
      setError("Please select an appointment slot");
      return;
    }

    try {
      setError("");
      setBusy(true);

      let patientId = selectedPatientId;

      // 1. Register patient if they don't exist
      if (!patientId) {
        const regRes = await api.registerPatient({
          first_name: firstName,
          last_name: lastName || "Patient",
          dob: dob || new Date().toISOString().substring(0, 10),
          mobile,
          email: email || `${firstName.toLowerCase()}@example.com`,
          gender,
          blood_group: bloodGroup,
          address: address || "Hospital Walk-in Address",
          allergies: allergies
            ? [{ substance: allergies, severity: "MODERATE" }]
            : [],
        });
        patientId = regRes.patient_id;
      }

      if (!patientId) throw new Error("Patient ID missing after registration");

      // 2. Book appointment
      const bookRes = await api.bookAppointment({
        patient_id: patientId,
        doctor_id: selectedDoctorId,
        scheduled_start: selectedSlot.scheduled_start,
        scheduled_end: selectedSlot.scheduled_end,
        reason: reason,
        specialty: selectedDoctor?.specialty || "General Medicine",
        appointment_type: "OPD",
        channel: "WALKIN",
      });

      const appointmentId = bookRes.appointment?.appointment_id || bookRes.appointment_id;
      if (!appointmentId) throw new Error("Appointment booking failed");

      // 3. Collect payment (mock backend invoice/pay)
      if (bookRes.encounter_id) {
        const invRes = await api.invoice(bookRes.encounter_id);
        if (invRes && invRes.invoice_id) {
          await api.pay(invRes.invoice_id, paymentMethod);
        }
      }

      // 4. Perform check-in
      const checkinRes = await api.checkin({
        appointment_id: appointmentId,
        patient_id: patientId,
        channel: "WALKIN",
      });

      onSuccess(
        checkinRes.token?.number || "A-000",
        `${firstName} ${lastName}`.trim()
      );
    } catch (err: any) {
      setError(err.message || "Failed to complete walk-in check-in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl relative" style={{ border: "1px solid var(--glass-border)", background: "var(--panel)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <User size={18} className="text-[var(--cyan)]" />
            <h3 className="text-md font-extrabold grad-text">Walk-In Patient Registration</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 transition text-[var(--muted)] hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Steps Breadcrumb */}
        <div className="flex border-b border-white/5 text-[12px] font-bold">
          <div className={`flex-1 py-3 text-center transition ${step === 1 ? "bg-white/5 text-white border-b-2 border-[var(--cyan)]" : "text-[var(--muted)]"}`}>
            1. Patient Info
          </div>
          <div className={`flex-1 py-3 text-center transition ${step === 2 ? "bg-white/5 text-white border-b-2 border-[var(--cyan)]" : "text-[var(--muted)]"}`}>
            2. Doctor &amp; Slot
          </div>
          <div className={`flex-1 py-3 text-center transition ${step === 3 ? "bg-white/5 text-white border-b-2 border-[var(--cyan)]" : "text-[var(--muted)]"}`}>
            3. Cash Payment
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/20 text-red-300 rounded-xl text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Enter mobile to lookup returning patients or click simulate to mock ABHA scan details.
                </p>
                <button
                  type="button"
                  onClick={handleAbhaScan}
                  className="btn ghost text-xs flex items-center gap-1.5 py-1 px-2.5"
                  style={{ borderColor: "var(--cyan)", color: "var(--cyan)" }}
                >
                  <Scan size={14} /> Scan ABHA Card
                </button>
              </div>

              <div className="grid gap-3 grid-cols-2">
                <Field label="Mobile Number (10 digits)">
                  <input
                    type="tel"
                    className="input font-mono"
                    maxLength={10}
                    placeholder="Enter mobile number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Email Address">
                  <input
                    type="email"
                    className="input"
                    placeholder="patient@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </div>

              {existingProfiles.length > 0 && (
                <div className="p-3 bg-blue-950/20 border border-blue-500/10 rounded-xl space-y-2">
                  <div className="text-xs font-extrabold text-[var(--cyan)]">
                    Existing Profiles found:
                  </div>
                  <div className="space-y-1">
                    {existingProfiles.map((p) => (
                      <div
                        key={p.patient_id}
                        onClick={() => handleSelectPatient(p)}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] hover:bg-white/5 border border-white/5 cursor-pointer text-xs font-semibold text-[#dce9ff]"
                      >
                        <span>
                          👤 {p.first_name} {p.last_name || ""} ({p.gender}, Dob: {p.dob ? p.dob.substring(0, 10) : "—"})
                        </span>
                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-[var(--muted)]">
                          Use profile →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 grid-cols-2">
                <Field label="First Name">
                  <input
                    className="input"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </Field>
                <Field label="Last Name">
                  <input
                    className="input"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 grid-cols-3">
                <Field label="Date of Birth">
                  <input
                    type="date"
                    className="input"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </Field>
                <Field label="Gender">
                  <select
                    className="input"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Blood Group">
                  <select
                    className="input"
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                  >
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"].map(
                      (bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      )
                    )}
                  </select>
                </Field>
              </div>

              <Field label="Home Address">
                <input
                  className="input"
                  placeholder="Street, City, Pin code"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>

              <Field label="Drug or Substance Allergies (Optional)">
                <input
                  className="input"
                  placeholder="e.g. Penicillin, NSAIDs (leave blank if none)"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                />
              </Field>

              <Field label="Reason for Visit / Chief Complaint">
                <input
                  className="input"
                  placeholder="e.g. Fever and cold, chest pain, routine checkup"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <Field label="Select Department &amp; Doctor">
                <select
                  className="input"
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors?.map((d: any) => (
                    <option key={d.doctor_id} value={d.doctor_id}>
                      {d.name} ({d.specialty} · OPD: ₹{d.opd_fee ?? 500})
                    </option>
                  ))}
                </select>
              </Field>

              {selectedDoctorId && (
                <div className="space-y-2">
                  <label className="text-[12px]" style={{ color: "var(--muted)" }}>
                    Available Appointment Slots (Today)
                  </label>
                  {slots.length === 0 ? (
                    <div className="text-center text-xs p-6 bg-white/[0.01] border border-dashed border-white/5 rounded-xl text-[var(--muted)]">
                      No slots available for today. Please verify doctor schedule.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((s, idx) => {
                        const startLocal = new Date(s.scheduled_start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const isSelected = selectedSlot?.scheduled_start === s.scheduled_start;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedSlot(s)}
                            className={`p-2 rounded-lg text-center text-xs font-bold transition border ${
                              isSelected
                                ? "bg-[var(--cyan)]/25 border-[var(--cyan)] text-white"
                                : "bg-white/[0.02] border-white/5 hover:bg-white/5 text-[var(--ink)]"
                            }`}
                          >
                            {startLocal}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                <div className="flex justify-between items-center text-sm font-bold border-b border-white/5 pb-2">
                  <span>Billing Item</span>
                  <span>Amount</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[var(--ink)]">
                  <span>
                    OPD Consultation Fee ({selectedDoctor?.name || "General Doctor"})
                  </span>
                  <span>₹{selectedDoctor?.opd_fee ?? 500}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[var(--ink)]">
                  <span>Hospital Registration Charge</span>
                  <span className="text-emerald-400 font-bold">FREE</span>
                </div>
                <div className="flex justify-between items-center font-extrabold text-md border-t border-white/5 pt-2 text-white">
                  <span>Total Amount Due</span>
                  <span className="text-[var(--cyan)]">₹{selectedDoctor?.opd_fee ?? 500}</span>
                </div>
              </div>

              <Field label="Choose Payment Channel">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "CASH", label: "💵 Cash Collected" },
                    { id: "UPI", label: "📱 QR Scan / UPI" },
                    { id: "CARD", label: "💳 Card Machine" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`p-3.5 rounded-xl border text-center text-xs font-bold transition ${
                        paymentMethod === m.id
                          ? "bg-[var(--cyan)]/25 border-[var(--cyan)] text-white"
                          : "bg-white/[0.01] border-white/5 hover:bg-white/5 text-[var(--muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl text-[11px] text-[var(--muted)] flex items-start gap-2">
                <Shield size={14} className="text-[var(--cyan)] shrink-0 mt-0.5" />
                <span>
                  Confirming this transaction will mark the bill as paid in the system, register the appointment, and dispatch a checked-in token to the triage nurse.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-black/10">
          <div>
            {step > 1 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep((s) => (s - 1) as any)}
                className="btn ghost text-xs py-1.5"
              >
                ← Back
              </button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <button
                type="button"
                disabled={
                  busy ||
                  (step === 1 && (!mobile || mobile.length < 10 || !firstName || !reason)) ||
                  (step === 2 && (!selectedDoctorId || !selectedSlot))
                }
                onClick={() => setStep((s) => (s + 1) as any)}
                className="btn text-xs py-1.5 flex items-center gap-1"
              >
                Continue <Calendar size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleSubmit}
                className="btn text-xs py-1.5 flex items-center gap-1"
                style={{ background: "linear-gradient(to right, var(--cyan), var(--violet))" }}
              >
                {busy ? "Registering..." : "Confirm & Check-In"} <CreditCard size={14} />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
