import React, { useState } from "react";
import {
  MapPin,
  Building2,
  HardDrive,
  Bell,
  CheckSquare,
  MessageSquare,
  Wifi,
  Radio,
  Send,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ 1. SVG Floor Digital Twin Map */
export function DigitalTwinSvgMap() {
  const [selectedBed, setSelectedBed] = useState<string | null>("ICU-07");

  const beds = [
    { id: "ICU-01", x: 75, y: 95, color: "#10b981", status: "Available", dept: "Intensive Care" },
    { id: "ICU-02", x: 125, y: 70, color: "#10b981", status: "Available", dept: "Intensive Care" },
    { id: "ICU-07", x: 215, y: 70, color: "#0078d4", status: "Active Care", dept: "General Medicine" },
    { id: "ICU-08", x: 265, y: 95, color: "#10b981", status: "Available", dept: "Intensive Care" },
    { id: "OPD-101", x: 315, y: 120, color: "#0078d4", status: "Consultation Room", dept: "OPD Wing" },
    { id: "LAB-01", x: 35, y: 120, color: "#8b5cf6", status: "Phlebotomy & Sample", dept: "Diagnostics" },
  ];

  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 400 170"
        className="w-full h-48 rounded-2xl bg-slate-950 border border-slate-800/90 shadow-2xl overflow-hidden"
      >
        <defs>
          <pattern id="twin-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          </pattern>
          <linearGradient id="wall-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0078d4" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0078d4" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#twin-grid)" />

        {/* Ambient Hallways */}
        <path d="M 40,135 L 200,50 L 360,135" fill="none" stroke="url(#wall-grad)" strokeWidth="2.5" />
        <path d="M 40,140 L 200,55 L 360,140" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {/* Zone Markers */}
        <text x="200" y="30" fill="rgba(255,255,255,0.5)" fontSize="9" fontWeight="bold" textAnchor="middle" letterSpacing="0.1em">
          CENTRAL CLINICAL WING · LEVEL 1
        </text>

        {beds.map((b) => {
          const isSelected = selectedBed === b.id;
          return (
            <g
              key={b.id}
              className="cursor-pointer transition-all duration-200"
              onClick={() => setSelectedBed(b.id)}
            >
              {/* Bed Polygon Outline */}
              <polygon
                points={`${b.x},${b.y} ${b.x + 28},${b.y - 14} ${b.x + 42},${b.y - 7} ${b.x + 14},${b.y + 7}`}
                fill={isSelected ? `${b.color}40` : `${b.color}18`}
                stroke={b.color}
                strokeWidth={isSelected ? "2" : "1.2"}
              />
              {/* Pillow indicator */}
              <polygon
                points={`${b.x + 18},${b.y - 9} ${b.x + 26},${b.y - 13} ${b.x + 30},${b.y - 11} ${b.x + 22},${b.y - 7}`}
                fill="rgba(255,255,255,0.3)"
                stroke={b.color}
                strokeWidth="1"
              />
              {/* Pulse circle for selected */}
              {isSelected && (
                <circle cx={b.x + 21} cy={b.y - 3} r="6" fill="none" stroke={b.color} strokeWidth="1.5" className="animate-ping" />
              )}
              {/* Bed Label */}
              <text x={b.x - 2} y={b.y + 19} fill="rgba(255,255,255,0.85)" fontSize="8.5" fontWeight="bold">
                {b.id}
              </text>
              <text x={b.x - 2} y={b.y + 27} fill={b.color} fontSize="7" fontWeight="bold">
                {b.status}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Selected location badge */}
      {selectedBed && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 text-white text-[11.5px] border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#0078d4] text-white">
              <MapPin size={13} />
            </span>
            <div>
              <span className="font-extrabold text-white">Telemetry Unit {selectedBed}</span>
              <span className="text-slate-400 block text-[10px]">Connected to IoT patient vitals monitoring grid</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
            <Wifi size={10} /> Active Node
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Hospital Map View */
export function HospitalMapView() {
  const [activeFloor, setActiveFloor] = useState<string>("Ground Floor");

  const floors = [
    { name: "Ground Floor", units: "Lobby, Main OPD Registration, Phlebotomy Lab 1, Central Pharmacy, Triage 1 & 2" },
    { name: "Floor 1", units: "General Medicine (Room 101), Cardiology (Room 105), Orthopaedics (Room 109), Consultation Wings" },
    { name: "Floor 2", units: "Diagnostic Imaging (MRI, CT, X-Ray), Endoscopy Suite, Day Surgery Unit" },
    { name: "Floor 3", units: "Intensive Care Unit (ICU), Cardiac Care Unit (CCU), Critical Telemetry Beds" },
  ];

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
              <MapPin className="text-rose-500" size={20} /> Hospital Floor &amp; Navigation Map
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Live interactive floor map and telemetry location coordinates of OPD consultation rooms, labs, and counters.
            </p>
          </div>

          {/* Floor selection pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 overflow-x-auto">
            {floors.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => setActiveFloor(f.name)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                  activeFloor === f.name ? "bg-white text-[#0078d4] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Digital Twin SVG Viewer */}
        <DigitalTwinSvgMap />

        {/* Floor Directory Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {floors.map((fl) => (
            <div
              key={fl.name}
              className={`p-3 rounded-xl border transition ${
                activeFloor === fl.name
                  ? "bg-blue-50/70 border-blue-200 shadow-2xs"
                  : "bg-slate-50/60 border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[12.5px] text-slate-900">{fl.name}</span>
                {activeFloor === fl.name && (
                  <span className="rounded-full bg-blue-100 text-[#0078d4] px-2 py-0.2 text-[9px] font-extrabold">Active</span>
                )}
              </div>
              <p className="text-[10.5px] text-slate-600 mt-1.5 leading-snug">{fl.units}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Departments View */
export function DepartmentsView() {
  const depts = [
    { name: "Emergency & Trauma", count: "24 Patients", staff: "12 Doctors, 28 Nurses", occupancy: "110% Capacity", room: "Ground Floor East", tone: "text-rose-600 bg-rose-50 border-rose-200" },
    { name: "General Medicine", count: "36 Patients", staff: "8 Doctors, 14 Nurses", occupancy: "Normal Load", room: "OPD Room 101 (1st Floor)", tone: "text-blue-600 bg-blue-50 border-blue-200" },
    { name: "ICU / CCU Unit", count: "14 Patients", staff: "4 Doctors, 16 Nurses", occupancy: "85% Capacity", room: "3rd Floor Critical Wing", tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { name: "Cardiology Center", count: "32 Patients", staff: "8 Doctors, 12 Nurses", occupancy: "75% Capacity", room: "OPD Room 105 (1st Floor)", tone: "text-indigo-600 bg-indigo-50 border-indigo-200" },
    { name: "Orthopaedics & Sports", count: "18 Patients", staff: "6 Doctors, 10 Nurses", occupancy: "Normal Load", room: "OPD Room 109 (1st Floor)", tone: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { name: "Clinical Pathology & Labs", count: "42 Samples", staff: "6 Technologists", occupancy: "Active Processing", room: "Lab 1 (Ground Floor)", tone: "text-purple-600 bg-purple-50 border-purple-200" },
    { name: "Central OPD Pharmacy", count: "15 Dispenses", staff: "6 Pharmacists", occupancy: "Packaging Active", room: "Counter 2 (Ground Floor)", tone: "text-teal-600 bg-teal-50 border-teal-200" },
    { name: "Diagnostic Radiology (MRI/CT)", count: "11 Studies", staff: "4 Radiologists", occupancy: "Moderate Load", room: "Floor 2 Diagnostic Suite", tone: "text-sky-600 bg-sky-50 border-sky-200" },
  ];

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
            <Building2 className="text-slate-700" size={20} /> Hospital Departments Directory
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Operational overview of hospital clinical departments, floor assignments, and occupancy indexes.
          </p>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {depts.map((dept, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-2.5 hover:bg-white hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-[13px]">{dept.name}</h4>
                  <span className="text-[10.5px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={11} className="text-slate-400" /> {dept.room}
                  </span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold border ${dept.tone}`}>
                  {dept.occupancy}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-center justify-between">
                <span>{dept.count}</span>
                <span className="font-semibold text-slate-500">{dept.staff}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 4. Assets View */
export function AssetsView() {
  const assets = [
    { tag: "VT-102", name: "Ventilator Servo-U (Advanced ICU)", loc: "ICU Bed 07", calib: "Approved (Valid till Dec 2026)", status: "Connected" },
    { tag: "ECG-99", name: "12-Lead Diagnostic ECG Telemetry", loc: "Triage Room 1", calib: "Approved", status: "Connected" },
    { tag: "US-88", name: "Ultrasound GE Voluson E10", loc: "Radiology Room 2", calib: "Pending Review", status: "Offline" },
    { tag: "DEF-04", name: "Biphasic Defibrillator Unit", loc: "Emergency Bay 1", calib: "Approved", status: "Connected" },
    { tag: "CBC-01", name: "Automated Hematology Analyzer Sysmex", loc: "Main Pathology Lab", calib: "Approved (Daily Auto-Calibrated)", status: "Connected" },
    { tag: "XRAY-02", name: "Digital Radiography Scanner Suite", loc: "Floor 2 X-Ray Suite", calib: "Approved", status: "Connected" },
  ];

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
            <HardDrive className="text-slate-700" size={20} /> High-Value Medical Equipment Assets
          </h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Calibration status, floor telemetry tracking, and connectivity diagnostics of hospital hardware devices.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-left">
            <thead>
              <tr className="border-b border-slate-200/80 pb-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="pb-2.5">Asset Tag</th>
                <th className="pb-2.5">Equipment Description</th>
                <th className="pb-2.5">Current Location</th>
                <th className="pb-2.5">Calibration Status</th>
                <th className="pb-2.5 text-right">IoT Connectivity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((asset, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 font-mono text-[#0078d4] font-black">{asset.tag}</td>
                  <td className="py-3 font-bold text-slate-800">{asset.name}</td>
                  <td className="py-3 font-semibold text-slate-600">{asset.loc}</td>
                  <td className="py-3 text-slate-500">{asset.calib}</td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold border ${
                        asset.status === "Connected"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      <Radio size={10} className={asset.status === "Connected" ? "animate-pulse text-emerald-600" : ""} />
                      {asset.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 5. Alerts View */
export function SystemAlertsView() {
  const alerts = [
    { title: "Lab Orders Ready for Review", desc: "Dr. Ananya Mehta ordered CRP and Complete Blood Count tests.", time: "10 mins ago", type: "LAB", priority: "HIGH" },
    { title: "Vital Signs Intake Recorded", desc: "Triage Nurse recorded BP 120/70 mmHg, Pulse 78 bpm, SpO2 98%.", time: "25 mins ago", type: "TRIAGE", priority: "NORMAL" },
    { title: "Consultation Approved & E-Prescription Signed", desc: "Prescription for Azithromycin & Amlodipine issued to pharmacy.", time: "45 mins ago", type: "RX", priority: "NORMAL" },
    { title: "Laboratory Slot Booked & Confirmed", desc: "Queue Token L-101 generated for Phlebotomy Lab 1.", time: "1 hour ago", type: "TOKEN", priority: "HIGH" },
    { title: "Payment Receipt Generated", desc: "Online Consultation booking fee ₹500 verified successfully via Razorpay.", time: "2 hours ago", type: "BILLING", priority: "NORMAL" },
    { title: "Appointment Confirmed with Dr. Ananya Mehta", desc: "General Medicine consultation scheduled for 18 Aug 2026.", time: "Yesterday", type: "APPOINTMENT", priority: "NORMAL" },
    { title: "Health Profile Created & MRN Allocated", desc: "Patient Record linked to MRN 2026 10016.", time: "Yesterday", type: "SYSTEM", priority: "NORMAL" },
    { title: "Digital Twin Telemetry Sync Complete", desc: "Smart Hospital OS telemetry connection established.", time: "Yesterday", type: "IOT", priority: "NORMAL" },
  ];

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
              <Bell className="text-amber-500" size={20} /> System Alerts &amp; Notifications
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Live notifications regarding your hospital appointments, lab order results, and medications.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold">
            8 Alerts
          </span>
        </div>

        <div className="space-y-2.5">
          {alerts.map((al, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-start justify-between gap-3 hover:bg-white hover:shadow-2xs transition"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-[13px] text-slate-900">{al.title}</span>
                  {al.priority === "HIGH" && (
                    <span className="px-2 py-0.2 rounded text-[9.5px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                      Action Required
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-slate-600">{al.desc}</p>
              </div>
              <span className="text-[10.5px] font-semibold text-slate-400 shrink-0 whitespace-nowrap">{al.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 6. Tasks View */
export function SystemTasksView() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Fasting for Blood Glucose & CRP sample collection", done: true, tag: "Diagnostics" },
    { id: 2, title: "Provide blood specimen at Phlebotomy Lab 1 (Ground Floor)", done: true, tag: "Laboratory" },
    { id: 3, title: "Attend OPD Consultation with Dr. Ananya Mehta", done: true, tag: "Consultation" },
    { id: 4, title: "Receive physical examination & approve clinical care summary", done: true, tag: "Clinical Care" },
    { id: 5, title: "Collect prescribed morning medications from Pharmacy Counter 2", done: true, tag: "Pharmacy" },
    { id: 6, title: "Take Azithromycin 500mg tablet post-meal", done: false, tag: "Medication" },
    { id: 7, title: "Log daily blood pressure & resting heart rate in patient portal", done: false, tag: "Vital Tracking" },
    { id: 8, title: "Review Knee X-Ray imaging findings with orthopaedics team", done: false, tag: "Radiology" },
    { id: 9, title: "Schedule 2-week cardiac follow-up review appointment", done: false, tag: "Follow-up" },
    { id: 10, title: "Complete post-discharge digital health survey", done: false, tag: "Feedback" },
    { id: 11, title: "Update emergency contact information in profile", done: true, tag: "Account" },
    { id: 12, title: "Download finalized electronic consultation summary PDF", done: false, tag: "Documents" },
    { id: 13, title: "Verify insurance cashless claim pre-authorization document", done: true, tag: "Billing" },
    { id: 14, title: "Verify profile photo and medical record number registration", done: true, tag: "Account" },
  ]);

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
              <CheckSquare className="text-blue-600" size={20} /> Patient Care &amp; Clinical Tasks
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Personalized health checklists, medicine schedules, and appointment preparations.
            </p>
          </div>
          <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[11px] font-extrabold">
            14 Tasks ({tasks.filter((t) => t.done).length} Completed)
          </span>
        </div>

        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => toggleTask(task.id)}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                task.done
                  ? "bg-slate-50 border-slate-200/60 opacity-80"
                  : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-2xs"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => {}}
                  className="h-4 w-4 rounded text-[#0078d4] focus:ring-0 cursor-pointer"
                />
                <span
                  className={`text-[12px] font-semibold truncate ${
                    task.done ? "line-through text-slate-400" : "text-slate-800"
                  }`}
                >
                  {task.title}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                {task.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 7. Messages View */
export function SystemMessagesView() {
  const [msgInput, setMsgInput] = useState("");
  const [messages, setMessages] = useState([
    { sender: "ClinIQ Care Bot", role: "AI Assistant", text: "Welcome to ClinIQ Smart Hospital. Your consultation summary and prescriptions are accessible 24/7.", time: "10:30 AM", isMe: false },
    { sender: "Dr. Ananya Mehta", role: "Consultant (General Medicine)", text: "Please ensure you take the prescribed antibiotics for 5 days without skipping doses. Reach out if fever recurs.", time: "11:15 AM", isMe: false },
    { sender: "Nurse Priya Sharma", role: "OPD Triage Nurse", text: "Your baseline blood pressure was within standard parameters. Continue resting well.", time: "11:45 AM", isMe: false },
    { sender: "Hospital Pharmacy Desk", role: "Main Pharmacy", text: "Your medication kit is ready for pickup at Counter 2.", time: "12:10 PM", isMe: false },
    { sender: "Diagnostics Lab Coordinator", role: "Laboratory Service", text: "Sample collection confirmed. Digital PDF report will be published on your portal automatically.", time: "12:30 PM", isMe: false },
    { sender: "Hospital Helpdesk", role: "Front Desk Coordinator", text: "Thank you for visiting ClinIQ. Your billing invoice receipt is available under the Billing tab.", time: "12:45 PM", isMe: false },
  ]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    setMessages((prev) => [
      ...prev,
      { sender: "You", role: "Patient", text: msgInput.trim(), time: "Just now", isMe: true },
    ]);
    setMsgInput("");
  };

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4 flex flex-col h-[520px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[18px] font-black text-slate-900 flex items-center gap-2">
              <MessageSquare className="text-teal-600" size={20} /> Healthcare Communications &amp; Messages
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Direct communications with your attending doctors, triage nurses, and hospital care team.
            </p>
          </div>
          <span className="rounded-full bg-teal-100 text-teal-800 border border-teal-200 px-2.5 py-0.5 text-[11px] font-extrabold">
            6 Messages
          </span>
        </div>

        {/* Message Thread List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.isMe ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11.5px] font-extrabold text-slate-800">{m.sender}</span>
                <span className="text-[10px] text-slate-400">({m.role})</span>
                <span className="text-[9.5px] text-slate-400">· {m.time}</span>
              </div>
              <div
                className={`p-3 rounded-2xl max-w-lg text-[12px] leading-relaxed shadow-2xs ${
                  m.isMe
                    ? "bg-[#0078d4] text-white rounded-br-none"
                    : "bg-slate-50 text-slate-800 border border-slate-200/80 rounded-bl-none"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={sendMessage} className="pt-3 border-t border-slate-100 flex items-center gap-2">
          <input
            type="text"
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
            placeholder="Type a message to your clinical care coordinator..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[12px] text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#0078d4] transition"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] shadow-sm flex items-center gap-1.5 transition"
          >
            <Send size={14} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
