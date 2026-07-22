import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, CheckCircle2, User, Plus, Trash2 } from "lucide-react";
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
  const [customAnalytes, setCustomAnalytes] = useState<{ name: string; value: string; unit: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [identityVerified, setIdentityVerified] = useState(false);

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

      // For unknown/custom tests, seed editable rows from any existing results
      if (analytes.length === 0 && selectedOrder.results && Array.isArray(selectedOrder.results) && selectedOrder.results.length > 0) {
        setCustomAnalytes(selectedOrder.results.map((r: any) => ({
          name: r.analyte || "",
          value: r.value?.toString() || "",
          unit: r.unit || "",
        })));
      } else if (analytes.length === 0) {
        setCustomAnalytes([{ name: "", value: "", unit: "" }]);
      } else {
        setCustomAnalytes([]);
      }

      setNotes(selectedOrder.notes || "");
      setFile(null);
      setAttachmentName(selectedOrder.attachment_name || "");
      setAttachmentUri(selectedOrder.attachment_uri || "");
      setSuccessMsg(null);
      setIdentityVerified(selectedOrder.status === "RESULTED");
    }
    // Only re-sync local form state when a different order is selected or its
    // workflow stage changes — not on every background poll of the same order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder?.lab_order_id, selectedOrder?.status]);

  const handleInputChange = (analyte: string, value: string) => {
    setInputs((prev) => ({ ...prev, [analyte]: value }));
  };

  const handleCustomAnalyteChange = (index: number, field: "name" | "value" | "unit", val: string) => {
    setCustomAnalytes((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const addCustomAnalyteRow = () => setCustomAnalytes((prev) => [...prev, { name: "", value: "", unit: "" }]);

  const removeCustomAnalyteRow = (index: number) =>
    setCustomAnalytes((prev) => prev.filter((_, i) => i !== index));

  const handleCollectSample = async () => {
    if (!selectedOrder) return;
    setCollecting(true);
    try {
      await api.collectLabSample(selectedOrder.lab_order_id);
      onSubmitSuccess();
    } catch (err: any) {
      alert(err?.message || "Failed to mark sample as collected.");
    } finally {
      setCollecting(false);
    }
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
    if (!identityVerified) {
      alert("Please confirm patient identity verification before submitting results.");
      return;
    }
    setBusy(true);
    setSuccessMsg(null);

    const knownAnalytes = Object.entries(inputs).map(([analyte, value]) => ({
      analyte,
      value: parseFloat(value) || 0.0,
    }));
    const custom = customAnalytes
      .filter((row) => row.name.trim())
      .map((row) => ({ analyte: row.name.trim(), value: parseFloat(row.value) || 0.0, unit: row.unit || null }));
    const payload = [...knownAnalytes, ...custom];

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
      setCustomAnalytes([]);
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
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "var(--ink)" }}>
          <FlaskConical size={16} /> {selectedOrder?.status === "RESULTED" ? "Edit Published Lab Results" : "Enter Lab Results"}
        </h3>

        {selectedOrder ? (
          <div className="space-y-4">
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
              <label className="flex items-start gap-2 p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-xl text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={identityVerified}
                  onChange={(e) => setIdentityVerified(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 size={13} className="text-emerald-400" /> Confirm patient identity
                  </span>
                  <span className="text-slate-300">
                    I have verified this patient's name and mobile number ({selectedOrder.patient_name}) against the order before proceeding.
                  </span>
                </span>
              </label>
            )}

            {selectedOrder.status === "CONFIRMED" ? (
              <button
                type="button"
                disabled={!identityVerified || collecting}
                onClick={handleCollectSample}
                className="btn w-full"
              >
                {collecting ? "Marking collected..." : "🧪 Mark Sample Collected"}
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={!identityVerified} className="space-y-3 disabled:opacity-50">
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
                    <div className="space-y-2">
                      <div className="text-[12.5px] text-[var(--muted)]">
                        No preset analytes for this test. Add the measurements the technician recorded:
                      </div>
                      {customAnalytes.map((row, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_60px_auto] gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Analyte name"
                            value={row.name}
                            onChange={(e) => handleCustomAnalyteChange(i, "name", e.target.value)}
                            className="input !py-1 text-[13px]"
                            style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                          />
                          <input
                            type="number"
                            step="any"
                            placeholder="Value"
                            value={row.value}
                            onChange={(e) => handleCustomAnalyteChange(i, "value", e.target.value)}
                            className="input text-center !py-1"
                            style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                          />
                          <input
                            type="text"
                            placeholder="Unit"
                            value={row.unit}
                            onChange={(e) => handleCustomAnalyteChange(i, "unit", e.target.value)}
                            className="input text-center !py-1"
                            style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomAnalyteRow(i)}
                            className="btn ghost !py-1 !px-2 text-red-400"
                            aria-label="Remove row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCustomAnalyteRow}
                        className="btn ghost !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                      >
                        <Plus size={12} /> Add measurement
                      </button>
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
                    {attachmentUri && !uploading && (
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1 pt-0.5">
                        <CheckCircle2 size={12} /> File uploaded ✅ — {attachmentName}
                      </div>
                    )}
                    <p className="text-[10.5px] text-[var(--dim)] pt-0.5">
                      Supports <b>DICOM</b> (.dcm), <b>NIfTI</b> (.nii), <b>PDF</b> (.pdf), and <b>Images</b> (.png, .jpg, .webp).
                    </p>
                  </div>
                </fieldset>

                <button type="submit" disabled={busy || uploading || !identityVerified} className="btn w-full mt-4">
                  {busy ? "Updating..." : uploading ? "Waiting for upload..." : selectedOrder.status === "RESULTED" ? "Update & Re-Publish Results" : "Submit & Publish Results"}
                </button>
              </form>
            )}
          </div>
        ) : (
          <Empty>Select a pending lab order from the list to enter results.</Empty>
        )}
      </Card>
    </div>
  );
}
