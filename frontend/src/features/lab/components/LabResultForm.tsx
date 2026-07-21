import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, CheckCircle2, User } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Empty } from "../../../components/ui";

const ANALYTE_MAP: Record<string, { name: string; unit: string; defaultVal: number }[]> = {
  "CBC": [
    { name: "WBC", unit: "x10⁹/L", defaultVal: 7.5 },
    { name: "Hb", unit: "g/dL", defaultVal: 14.0 },
    { name: "Platelets", unit: "x10⁹/L", defaultVal: 250 },
  ],
  "CRP": [{ name: "CRP", unit: "mg/L", defaultVal: 3.2 }],
  "HbA1c": [{ name: "HbA1c", unit: "%", defaultVal: 5.8 }],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mg/dL", defaultVal: 185 },
    { name: "Triglycerides", unit: "mg/dL", defaultVal: 140 },
    { name: "HDL", unit: "mg/dL", defaultVal: 50 },
    { name: "LDL", unit: "mg/dL", defaultVal: 107 },
  ],
  "TSH": [{ name: "TSH", unit: "mIU/L", defaultVal: 2.1 }],
  "RFT": [
    { name: "Urea", unit: "mg/dL", defaultVal: 28 },
    { name: "Creatinine", unit: "mg/dL", defaultVal: 0.95 },
  ],
};

interface LabResultFormProps {
  selectedOrder: any | null;
  onClearSelection: () => void;
  onSubmitSuccess: () => void;
}

export default function LabResultForm({
  selectedOrder,
  onClearSelection,
  onSubmitSuccess,
}: LabResultFormProps) {
  const qc = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // When selectedOrder changes, populate default or existing values
  useEffect(() => {
    if (selectedOrder) {
      const analytes = ANALYTE_MAP[selectedOrder.test_name] || [];
      const init: Record<string, string> = {};
      
      const existingResultsMap: Record<string, string> = {};
      if (selectedOrder.results && Array.isArray(selectedOrder.results)) {
        selectedOrder.results.forEach((r: any) => {
          if (r.analyte) {
            existingResultsMap[r.analyte.toLowerCase().trim()] = r.value?.toString() || "";
          }
        });
      }

      analytes.forEach((a) => {
        const key = a.name.toLowerCase().trim();
        init[a.name] = existingResultsMap[key] !== undefined ? existingResultsMap[key] : a.defaultVal.toString();
      });

      setInputs(init);
      setNotes(selectedOrder.notes || "");
      setFile(null);
      setAttachmentName(selectedOrder.attachment_name || "");
      setAttachmentUri(selectedOrder.attachment_uri || "");
      setSuccessMsg(null);
    }
  }, [selectedOrder]);

  const handleInputChange = (analyte: string, value: string) => {
    setInputs((prev) => ({ ...prev, [analyte]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !selectedOrder) return;
    setFile(f);
    setAttachmentName(f.name);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", f);

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
      onClearSelection();
      setInputs({});
      setNotes("");
      setFile(null);
      setAttachmentName("");
      setAttachmentUri("");
      onSubmitSuccess();
    } catch (err: any) {
      alert(err?.message || "Failed to submit results.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {successMsg && (
        <div className="alertbox flex items-center gap-2 text-emerald-400 bg-emerald-950/10 border-emerald-500/20">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      <Card className="h-full">
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "#dce9ff" }}>
          <FlaskConical size={16} /> {selectedOrder?.status === "RESULTED" ? "Edit Published Lab Results" : "Enter Lab Results"}
        </h3>

        {selectedOrder ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 border border-[var(--glass-border)] rounded-xl bg-white/5 space-y-1.5 text-[13px]">
              <div className="flex items-center gap-2 text-[var(--cyan)] font-bold">
                <User size={14} /> Patient Information
              </div>
              <div className="text-slate-200">Name: <b>{selectedOrder.patient_name}</b></div>
              <div className="text-slate-300">Test Ordered: <b>{selectedOrder.test_name}</b></div>
              <div className="text-slate-300">Order Reference: <b>{selectedOrder.qr_code}</b></div>
            </div>

            {selectedOrder.status === "RESULTED" ? (
              <div className="p-3 border border-amber-500/30 bg-amber-500/10 rounded-xl text-xs space-y-1 text-amber-300">
                <div className="font-bold flex items-center justify-between">
                  <span>✏️ Editing Published Results</span>
                  <span className="text-[10px] text-amber-200/80 bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-500/20">Override Mode</span>
                </div>
                <div className="text-slate-300">
                  Modifying findings or uploading a new diagnostic scan will override and update the existing published report.
                </div>
              </div>
            ) : (
              <div className="p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-xl text-xs space-y-1 text-emerald-400">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" /> Patient Verified in Lab Room
                </div>
                <div className="text-slate-300">
                  Verify name, mobile number, and token before collecting sample or running diagnostics.
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="font-bold text-[12px] uppercase tracking-wider text-[var(--dim)]">
                Analyte Measurements
              </div>

              {(ANALYTE_MAP[selectedOrder.test_name] || []).map((a) => (
                <div key={a.name} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                  <label className="text-[13px] text-slate-300 font-medium">
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
                <div className="text-[12.5px] text-[var(--muted)]">
                  No numerical inputs required for this order. Click submit to finalize results.
                </div>
              )}

              {/* Clinical Notes Field */}
              <div className="space-y-1 pt-2 border-t border-white/5">
                <label className="block font-bold text-slate-300 text-xs">Clinical Findings / Notes</label>
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
                <label className="block font-bold text-slate-300 text-xs">Upload Diagnostic Scan Attachment</label>
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
              {busy ? "Updating..." : uploading ? "Waiting for upload..." : selectedOrder.status === "RESULTED" ? "Update & Re-Publish Results" : "Submit & Publish Results"}
            </button>
          </form>
        ) : (
          <Empty>Select a pending lab order from the list to enter results.</Empty>
        )}
      </Card>
    </div>
  );
}
