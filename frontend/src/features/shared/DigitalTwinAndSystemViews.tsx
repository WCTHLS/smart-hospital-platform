import React from "react";
import {
  MapPin,
  Building2,
  HardDrive,
  Settings,
  Bell,
  CheckSquare,
  MessageSquare,
} from "lucide-react";

export function DigitalTwinMap() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-32 rounded-lg bg-slate-900 border border-slate-800 shadow-inner">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      {/* Wall outlines */}
      <path d="M 50,120 L 200,45 L 350,120" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      
      {/* Beds */}
      {[
        { id: "ICU-01", x: 80, y: 100, color: "#10b981", label: "Available" },
        { id: "ICU-02", x: 130, y: 75, color: "#10b981", label: "Available" },
        { id: "ICU-07", x: 220, y: 75, color: "#ef4444", label: "Ahmed Khan" },
        { id: "ICU-08", x: 270, y: 100, color: "#10b981", label: "Available" },
      ].map((b) => (
        <g key={b.id}>
          {/* Bed Base */}
          <polygon
            points={`${b.x},${b.y} ${b.x+30},${b.y-15} ${b.x+45},${b.y-7} ${b.x+15},${b.y+8}`}
            fill={b.color === "#ef4444" ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.15)"}
            stroke={b.color}
            strokeWidth="1.5"
          />
          {/* Pillow */}
          <polygon
            points={`${b.x+20},${b.y-10} ${b.x+28},${b.y-14} ${b.x+32},${b.y-12} ${b.x+24},${b.y-8}`}
            fill="rgba(255,255,255,0.25)"
            stroke={b.color}
            strokeWidth="1"
          />
          {/* Label */}
          <text x={b.x - 2} y={b.y+20} fill="rgba(255,255,255,0.6)" fontSize="8.5" fontWeight="bold">
            {b.id}
          </text>
          <text x={b.x - 2} y={b.y+28} fill={b.color} fontSize="7.5" fontWeight="bold">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HospitalMapView() {
  return (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <MapPin className="text-rose-500" size={20} /> Hospital Floor Map
        </h2>
        <p className="text-xs text-slate-400">Dynamic 3D vector coordinates representing active hospital telemetry digital twins.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm flex justify-center items-center bg-slate-950 min-h-[300px]">
        <div className="w-full max-w-lg">
          <DigitalTwinMap />
        </div>
      </div>
    </div>
  );
}

export function DepartmentsView() {
  return (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Building2 className="text-slate-700" size={20} /> Hospital Departments Directory
        </h2>
        <p className="text-xs text-slate-400">Live operational overview of departments, staffing indexes, and occupancy levels.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: "Emergency Department", count: "24 Patients", staff: "12 Doctors, 28 Nurses", occupancy: "110% Capacity" },
          { name: "ICU / CCU Unit", count: "14 Patients", staff: "4 Doctors, 16 Nurses", occupancy: "85% Capacity" },
          { name: "Cardiology Center", count: "32 Patients", staff: "8 Doctors, 12 Nurses", occupancy: "75% Capacity" },
          { name: "Pharmacy Main", count: "42 Pendings", staff: "6 Pharmacists", occupancy: "Normal Load" },
          { name: "Radiology Central", count: "11 Studies", staff: "4 Radiologists", occupancy: "Moderate Load" },
        ].map((dept, idx) => (
          <div key={idx} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm text-xs space-y-1">
            <h4 className="font-extrabold text-slate-800 text-[12.5px]">{dept.name}</h4>
            <div className="text-slate-500 font-semibold">{dept.count} · {dept.staff}</div>
            <div className="text-[#0078d4] font-bold">{dept.occupancy}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetsView() {
  return (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <HardDrive className="text-slate-700" size={20} /> High-Value Medical Equipment Assets
        </h2>
        <p className="text-xs text-slate-400">Verify calibration triggers, operational status, and floor location of tracking assets.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-black/[0.08] pb-1.5 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider">
              <th className="pb-2">Asset Tag</th>
              <th className="pb-2">Equipment Description</th>
              <th className="pb-2">Current Location</th>
              <th className="pb-2">Calibration Status</th>
              <th className="pb-2 text-right">Connectivity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.03]">
            {[
              { tag: "VT-102", name: "Ventilator Servo-U", loc: "ICU Bed 07", calib: "Approved", status: "Connected" },
              { tag: "ECG-99", name: "ECG Telemetry 12-lead", loc: "ER Trauma Room 1", calib: "Approved", status: "Connected" },
              { tag: "US-88", name: "Ultrasound GE Voluson", loc: "OBS/GYN Exam Room", calib: "Pending Review", status: "Offline" },
            ].map((asset, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-2.5 font-mono text-[#0078d4] font-bold">{asset.tag}</td>
                <td className="py-2.5 font-bold text-slate-800">{asset.name}</td>
                <td className="py-2.5 font-semibold text-slate-600">{asset.loc}</td>
                <td className="py-2.5 text-slate-500">{asset.calib}</td>
                <td className="py-2.5 text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[8.5px] font-extrabold border ${
                    asset.status === "Connected" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                  }`}>{asset.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SystemView({ type }: { type: string }) {
  const title = type.charAt(0).toUpperCase() + type.slice(1);
  const Icon = type === "alerts" ? Bell : (type === "tasks" ? CheckSquare : (type === "messages" ? MessageSquare : Settings));

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Icon className="text-[#0c3b63]" size={20} /> System {title} Panel
        </h2>
        <p className="text-xs text-slate-400">Configure preferences, check system tasks checklist, and read communications.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm text-xs text-slate-700 leading-relaxed max-w-xl">
        <div className="font-bold text-slate-800 mb-2">Configure ClinIQ Preferences</div>
        <p className="text-slate-500">Settings are synced with active LDAP directory credentials. To change notification flags, contact administrative support.</p>
        <div className="mt-3 p-3 bg-slate-50 border border-black/[0.04] rounded-xl flex items-center justify-between">
          <span className="font-semibold">SMS Patients on Resulted Labs</span>
          <span className="text-[#107C10] font-bold">Enabled</span>
        </div>
      </div>
    </div>
  );
}
