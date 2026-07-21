import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Clipboard, FileCheck2, User, Clock, CheckCircle2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty } from "../../../components/ui";

const ANALYTE_MAP: Record<string, { name: string; unit: string; defaultVal: number }[]> = {
  "CBC": [
    { name: "WBC", unit: "x10⁹/L", defaultVal: 7.5 },
    { name: "Hb", unit: "g/dL", defaultVal: 14.0 },
    { name: "Platelets", unit: "x10⁹/L", defaultVal: 250.0 },
  ],
  "CRP": [
    { name: "CRP", unit: "mg/L", defaultVal: 2.0 },
  ],
  "HbA1c": [
    { name: "HbA1c", unit: "%", defaultVal: 5.5 },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mg/dL", defaultVal: 180.0 },
    { name: "LDL", unit: "mg/dL", defaultVal: 90.0 },
    { name: "HDL", unit: "mg/dL", defaultVal: 50.0 },
  ],
  "TSH": [
    { name: "TSH", unit: "µIU/mL", defaultVal: 2.2 },
  ],
  "RFT": [
    { name: "Urea", unit: "mg/dL", defaultVal: 25.0 },
    { name: "Creatinine", unit: "mg/dL", defaultVal: 0.9 },
  ],
  "Chest X-ray": [
    { name: "Lung Fields (Normal=0, Abnormal=1)", unit: "", defaultVal: 0.0 },
  ],
};

export default function LabPortal() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [deptFilter, setDeptFilter] = useState<"ALL" | "PATHOLOGY" | "RADIOLOGY" | "CARDIOLOGY">("ALL");
  
  // File Upload states
  const [file, setFile] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");
  const [uploading, setUploading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: orders, refetch } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: api.labOrders,
    refetchInterval: 5000,
  });

  const handleSelectOrder = (order: any) => {
    setSelectedOrder(order);
    setSuccessMsg(null);
    setNotes("");
    setFile(null);
    setAttachmentName("");
    setAttachmentUri("");
    const analytes = ANALYTE_MAP[order.test_name] || [];
    const initialInputs: Record<string, string> = {};
    analytes.forEach((a) => {
      initialInputs[a.name] = a.defaultVal.toString();
    });
    setInputs(initialInputs);
  };

  const handleInputChange = (analyte: string, value: string) => {
    setInputs((prev) => ({ ...prev, [analyte]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !selectedOrder) return;
    
    setFile(selectedFile);
    setAttachmentName(selectedFile.name);
    setUploading(true);
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    
    try {
      const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
      const res = await fetch(`${BASE}/api/v1/lab-orders/${selectedOrder.lab_order_id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAttachmentUri(data.uri);
    } catch (err) {
      console.error(err);
      alert("File upload failed. Please try again.");
      setFile(null);
      setAttachmentName("");
      setAttachmentUri("");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setBusy(true);
    setSuccessMsg(null);

    const payload = Object.entries(inputs).map(([analyte, value]) => ({
      analyte,
      value: parseFloat(value) || 0.0,
    }));

    try {
      await api.submitLabResults(selectedOrder.lab_order_id, {
        results: payload,
        notes: notes || null,
        attachment_name: attachmentName || null,
        attachment_uri: attachmentUri || null,
      });
      
      setSuccessMsg(`Results successfully submitted for ${selectedOrder.patient_name}'s ${selectedOrder.test_name}!`);
      setSelectedOrder(null);
      setInputs({});
      setNotes("");
      setFile(null);
      setAttachmentName("");
      setAttachmentUri("");
      refetch();
      qc.invalidateQueries({ queryKey: ["lab"] });
    } catch (err: any) {
      alert(err?.message || "Failed to submit results.");
    } finally {
      setBusy(false);
    }
  };

  const pending = orders?.filter((o: any) => {
    const isPending = o.status === "CONFIRMED";
    const category = o.category || "PATHOLOGY";
    return isPending && (deptFilter === "ALL" || category === deptFilter);
  }) || [];

  const completed = orders?.filter((o: any) => {
    const isCompleted = o.status === "RESULTED";
    const category = o.category || "PATHOLOGY";
    return isCompleted && (deptFilter === "ALL" || category === deptFilter);
  }) || [];

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
            <FlaskConical size={22} className="text-[var(--cyan)]" /> Lab Diagnostics Portal
          </h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--muted)" }}>
            Enter and submit clinical values for ordered patient tests. Lab AI automatically processes the result flags.
          </p>
        </div>
        <span className="live">LIVE REFRESH</span>
      </Card>

      {/* Department Filter Bar */}
      <div className="flex flex-wrap gap-2 p-1 bg-white/[0.02] border border-white/5 rounded-xl w-fit">
        {[
          { id: "ALL", label: "🏢 All Departments" },
          { id: "PATHOLOGY", label: "🧪 Pathology (Blood/Urine)" },
          { id: "RADIOLOGY", label: "🩻 Radiology (X-Ray/Imaging)" },
          { id: "CARDIOLOGY", label: "❤️ Cardiology (ECG)" },
        ].map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setDeptFilter(d.id as any);
              setSelectedOrder(null); // Clear selected if switching departments
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              deptFilter === d.id
                ? "bg-white/10 text-white"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Left Column: Queues */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-md font-bold mb-3 flex items-center gap-2" style={{ color: "#dce9ff" }}>
              <Clipboard size={16} /> Pending Lab Tests ({pending.length})
            </h3>
            {pending.length === 0 ? (
              <Empty>No pending lab orders at this time.</Empty>
            ) : (
              <div className="space-y-2">
                {pending.map((o: any) => (
                  <div
                    key={o.lab_order_id}
                    onClick={() => handleSelectOrder(o)}
                    className={`p-3 border rounded-xl cursor-pointer transition flex justify-between items-center ${
                      selectedOrder?.lab_order_id === o.lab_order_id
                        ? "border-[var(--cyan)] bg-[var(--cyan)]/5"
                        : "border-[var(--glass-border)] hover:bg-white/5 bg-white/[0.01]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-slate-200">{o.patient_name}</div>
                      <div className="text-[12px] flex items-center gap-3" style={{ color: "var(--dim)" }}>
                        <span>Test: <b className="text-[var(--cyan)]">{o.test_name}</b></span>
                        <span>Code: {o.qr_code}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-amber-400" />
                      <Tag tone="amber">PENDING</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-md font-bold mb-3 flex items-center gap-2" style={{ color: "#dce9ff" }}>
              <FileCheck2 size={16} /> Completed Tests ({completed.length})
            </h3>
            {completed.length === 0 ? (
              <Empty>No completed lab results today.</Empty>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {completed.map((o: any) => (
                  <div
                    key={o.lab_order_id}
                    className="p-3 border border-white/5 rounded-xl bg-white/[0.01] flex justify-between items-center text-[13px]"
                  >
                    <div>
                      <div className="font-semibold text-slate-300">{o.patient_name}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {o.test_name} · {o.qr_code}
                      </div>
                      {o.attachment_uri && (
                        <a
                          href={`${import.meta.env.VITE_API_BASE_URL ?? ""}${o.attachment_uri}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--cyan)] hover:underline inline-flex items-center gap-0.5 mt-1"
                        >
                          📄 View Uploaded Report
                        </a>
                      )}
                    </div>
                    <Tag tone="green">COMPLETED</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Entry Form */}
        <div>
          {successMsg && (
            <div className="alertbox mb-4 flex items-center gap-2 text-emerald-400 bg-emerald-950/10 border-emerald-500/20">
              <CheckCircle2 size={16} /> {successMsg}
            </div>
          )}

          <Card className="h-full">
            <h3 className="text-md font-bold mb-3 flex items-center gap-2" style={{ color: "#dce9ff" }}>
              <FlaskConical size={16} /> Enter Lab Results
            </h3>

            {selectedOrder ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 border border-[var(--glass-border)] rounded-xl bg-white/5 space-y-1.5 text-[13px]">
                  <div className="flex items-center gap-2 text-[var(--cyan)] font-bold">
                    <User size={14} /> Patient Information
                  </div>
                  <div className="text-slate-200">Name: <b>{selectedOrder.patient_name}</b></div>
                  <div style={{ color: "var(--muted)" }}>Test Ordered: <b>{selectedOrder.test_name}</b></div>
                  <div style={{ color: "var(--muted)" }}>Order Reference: <b>{selectedOrder.qr_code}</b></div>
                </div>

                <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-xl text-xs space-y-1 text-emerald-400">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400" /> Patient Verified in Lab Room
                  </div>
                  <div className="text-slate-300">
                    Verify name, mobile number, and token before collecting sample or running diagnostics.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="font-bold text-[12px] uppercase tracking-wider" style={{ color: "var(--dim)" }}>
                    Analyte Measurements
                  </div>

                  {(ANALYTE_MAP[selectedOrder.test_name] || []).map((a) => (
                    <div key={a.name} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                      <label className="text-[13px] text-slate-300">
                        {a.name} {a.unit && `(${a.unit})`}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={inputs[a.name] || ""}
                        onChange={(e) => handleInputChange(a.name, e.target.value)}
                        required
                        className="input text-center !py-1"
                        style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                      />
                    </div>
                  ))}

                  {(!ANALYTE_MAP[selectedOrder.test_name] || ANALYTE_MAP[selectedOrder.test_name].length === 0) && (
                    <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                      No numerical inputs required for this order. Click submit to finalize results.
                    </div>
                  )}

                  {/* Clinical Notes Field */}
                  <div className="space-y-1 pt-2 border-t border-white/5">
                    <label className="block font-bold text-slate-300">Clinical Findings / Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Lung fields appear clear, no active consolidation seen."
                      className="input text-xs"
                      rows={3}
                      style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                    />
                  </div>

                  {/* File Upload Selector */}
                  <div className="space-y-1.5 pt-2">
                    <label className="block font-bold text-slate-300">Upload Diagnostic Scan Attachment</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        id="lab-upload"
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*,application/pdf,.dcm,.dicom,.nii,.nii.gz,application/dicom"
                      />
                      <label
                        htmlFor="lab-upload"
                        className="btn ghost !py-1 !px-3 text-xs inline-flex items-center gap-1.5 cursor-pointer hover:bg-white/10"
                      >
                        Choose File
                      </label>
                      <span className="text-[11px] text-[var(--muted)] overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]">
                        {uploading ? "Uploading file..." : attachmentName || "No file uploaded"}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[var(--dim)] pt-0.5">
                      Supports <b>DICOM</b> (.dcm), <b>NIfTI</b> (.nii), <b>PDF</b> (.pdf), and <b>Images</b> (.png, .jpg, .webp).
                    </p>
                  </div>
                </div>

                <button type="submit" disabled={busy || uploading} className="btn w-full mt-4">
                  {busy ? "Submitting..." : uploading ? "Waiting for upload..." : "Submit & Publish Results"}
                </button>
              </form>
            ) : (
              <Empty>Select a pending lab order from the list to enter results.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
