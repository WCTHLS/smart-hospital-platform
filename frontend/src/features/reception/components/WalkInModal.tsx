import { useState, useEffect } from "react";
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
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [reason, setReason] = useState("General consultation");
  const [specialty, setSpecialty] = useState("");
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const availableDoctors = Array.from(
    new Map(
      slots.map((slot: any) => [slot.doctor_id, {
        doctor_id: slot.doctor_id,
        name: slot.doctor_name,
        specialty: slot.specialty,
        opd_fee: slot.opd_fee,
      }])
    ).values()
  );
  const selectedDoctorSlots = slots.filter((slot: any) => slot.doctor_id === selectedDoctorId);

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

  // Route the chief complaint to a specialty and load today's available doctors/slots.
  useEffect(() => {
    if (step !== 2 || !reason.trim()) return;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setError("");
        setSelectedDoctorId("");
        setSelectedDoctor(null);
        setSelectedSlot(null);
        const todayStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const res = await api.appointmentSlots({ appointment_date: todayStr, reason: reason.trim() });
        setSpecialty(res.specialty || "General Medicine");
        setSlots(res.slots || []);
      } catch (err: any) {
        setSpecialty("");
        setSlots([]);
        setError(err.message || "Failed to fetch today's specialty doctors and slots");
      } finally {
        setSlotsLoading(false);
      }
    };
    fetchSlots();
  }, [step, reason]);

  const handleDoctorChange = (doctorId: string) => {
    setSelectedDoctorId(doctorId);
    setSelectedDoctor(availableDoctors.find((doctor: any) => doctor.doctor_id === doctorId) || null);
    setSelectedSlot(null);
  };

  // Complete Walk-in check-in
  const handleSubmit = async () => {
    if (!selectedSlot) {
      setError("Please select an appointment slot");
      return;
    }
    if (!selectedPatientId && !/^\d{10}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number");
      setStep(1);
      return;
    }
    if (!selectedPatientId && (!firstName.trim() || !lastName.trim() || !dob)) {
      setError("First name, last name, and date of birth are required for registration");
      setStep(1);
      return;
    }

    try {
      setError("");
      setBusy(true);

      let patientId = selectedPatientId;

      // 1. Register patient if they don't exist
      if (!patientId) {
        const regRes = await api.registerPatient({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          mobile,
          email: email.trim() || null,
          gender,
          blood_group: bloodGroup,
          address: address.trim() || null,
          issues: allergies
            ? [{ issue_name: allergies, onset_info: "Unknown", status: "ACTIVE" }]
            : [],
        });
        patientId = regRes.patient?.patient_id || regRes.patient_id;
      }

      if (!patientId) throw new Error("Patient ID missing after registration");

      // 2. Book appointment
      const bookRes = await api.bookAppointment({
        patient_id: patientId,
        doctor_id: selectedDoctorId,
        scheduled_start: selectedSlot.scheduled_start,
        scheduled_end: selectedSlot.scheduled_end,
        reason: reason,
        specialty: selectedSlot.specialty || specialty || "General Medicine",
        appointment_type: "OPD",
        channel: "WALKIN",
      });

      const appointmentId = bookRes.appointment?.appointment_id || bookRes.appointment_id;
      if (!appointmentId) throw new Error("Appointment booking failed");

      // 3. Perform check-in so the encounter exists before creating its invoice.
      const checkinRes = await api.checkin({
        appointment_id: appointmentId,
        patient_id: patientId,
        channel: "WALKIN",
      });

      // 4. Persist the amount collected at Reception against the encounter invoice.
      // Reception payments use the Payment table; RazorpayOrder is only for
      // online Razorpay checkout and is intentionally not required for cash.
      if (!checkinRes.encounter_id) throw new Error("Encounter ID missing after check-in");
      const invRes = await api.invoice(checkinRes.encounter_id);
      if (!invRes?.invoice_id) throw new Error("Invoice creation failed after check-in");
      const unpaidAmount = Number(invRes.unpaid_amount ?? invRes.balance ?? 0);
      if (unpaidAmount > 0.01) {
        await api.pay(invRes.invoice_id, paymentMethod);
      }

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
                    required
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
                    required
                  />
                </Field>
                <Field label="Last Name">
                  <input
                    className="input"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
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
                    max={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}
                    required
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
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Mapped specialty</div>
                <div className="mt-1 text-sm font-extrabold text-[var(--cyan)]">{specialty || (slotsLoading ? "Mapping complaint..." : "Not available")}</div>
                <div className="mt-1 text-[11px] text-[var(--muted)]">Based on: “{reason}”</div>
              </div>

              <Field label="Available Specialty Doctor (Today)">
                <select
                  className="input"
                  value={selectedDoctorId}
                  onChange={(e) => handleDoctorChange(e.target.value)}
                  disabled={slotsLoading || availableDoctors.length === 0}
                >
                  <option value="">{slotsLoading ? "Loading available doctors..." : "-- Choose Doctor --"}</option>
                  {availableDoctors.map((d: any) => (
                    <option key={d.doctor_id} value={d.doctor_id}>
                      {d.name} ({d.specialty} · OPD: ₹{d.opd_fee ?? 500})
                    </option>
                  ))}
                </select>
              </Field>

              {!slotsLoading && availableDoctors.length === 0 && (
                <div className="text-center text-xs p-6 bg-white/[0.01] border border-dashed border-white/5 rounded-xl text-[var(--muted)]">
                  No {specialty || "matching specialty"} doctors or slots are available today.
                </div>
              )}

              {selectedDoctorId && (
                <div className="space-y-2">
                  <label className="text-[12px]" style={{ color: "var(--muted)" }}>
                    Available Appointment Slots (Today)
                  </label>
                  {selectedDoctorSlots.length === 0 ? (
                    <div className="text-center text-xs p-6 bg-white/[0.01] border border-dashed border-white/5 rounded-xl text-[var(--muted)]">
                      No slots available for today. Please verify doctor schedule.
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {selectedDoctorSlots.map((s, idx) => {
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
                  (step === 1 && (!/^\d{10}$/.test(mobile) || !firstName.trim() || !lastName.trim() || !dob || !reason.trim())) ||
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
