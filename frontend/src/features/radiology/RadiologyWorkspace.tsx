import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Scan, FileText, CheckCircle2, User, Play, RotateCcw, 
  ZoomIn, Contrast, Move, Eye, FileDown, AlertTriangle, 
  BellRing, Send, ChevronDown, ListFilter, Activity, Upload,
  Sparkles
} from "lucide-react";
import { api } from "../../lib/api";
import { Card, Empty } from "../../components/ui";

export default function RadiologyWorkspace() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [modalityFilter, setModalityFilter] = useState<"ALL" | "CT" | "MRI" | "X-RAY" | "US">("ALL");

  // PACS Image Viewer Interactive Controls
  const [scale, setScale] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [invert, setInvert] = useState(false);
  const [toolActive, setToolActive] = useState<string>("none");
  const [activeSeries, setActiveSeries] = useState("axial");

  // Reporting Form States
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [category, setCategory] = useState("NORMAL");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // File upload state variables
  const [uploading, setUploading] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");

  // Copilot States
  const [copilotTab, setCopilotTab] = useState<"findings" | "insights" | "protocols" | "ask">("findings");
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([
    { sender: "copilot", text: "AI assessment loaded for CT Chest w/ Contrast. Suggestive filling defect identified in right lower lobe pulmonary artery." }
  ]);

  const { data: orders, refetch } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: api.labOrders,
    refetchInterval: 5000,
  });

  // Filter orders to render only RADIOLOGY modality scans
  const todayStr = new Date().toLocaleDateString('sv').split('T')[0];
  const radiologyOrders = orders?.filter((o: any) => {
    if (o.category !== "RADIOLOGY") return false;
    // Hide unpaid orders
    if (o.status === "CREATED") return false;
    // Only show on the booked date
    if (o.booking_date && o.booking_date !== todayStr) return false;
    return true;
  }) || [];

  // Filter based on modality tabs
  const filteredOrders = radiologyOrders.filter((o: any) => {
    if (modalityFilter === "ALL") return true;
    const testLower = (o.test_name || "").toLowerCase();
    if (modalityFilter === "CT") return testLower.includes("ct");
    if (modalityFilter === "MRI") return testLower.includes("mri");
    if (modalityFilter === "X-RAY") return testLower.includes("x-ray") || testLower.includes("xray");
    if (modalityFilter === "US") return testLower.includes("ultrasound") || testLower.includes("usg");
    return true;
  });

  // Sync selected order details on refetch
  const liveSelectedOrder = selectedOrder
    ? orders?.find((o: any) => o.lab_order_id === selectedOrder.lab_order_id) || selectedOrder
    : null;

  const gradcamUri = liveSelectedOrder?.ai_analysis_summary?.match(/Grad-CAM(?:\+\+)? Heatmap:\s*(\/uploads\/[^\s\r\n]+)/i)?.[1];

  // Patient Profile details query hook (Placed after liveSelectedOrder declaration to prevent TS2448 block-scoped TDZ error)
  const { data: p360 } = useQuery({
    queryKey: ["p360-profile", liveSelectedOrder?.patient_id],
    queryFn: () => api.patient360(liveSelectedOrder?.patient_id!),
    enabled: !!liveSelectedOrder?.patient_id,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !liveSelectedOrder) return;
    setAttachmentName(f.name);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
      const res = await fetch(`${BASE}/api/v1/lab-orders/${liveSelectedOrder.lab_order_id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAttachmentUri(data.uri);
    } catch (err) {
      console.error(err);
      alert("File upload failed. Please try again.");
      setAttachmentName("");
      setAttachmentUri("");
    } finally {
      setUploading(false);
    }
  };

  // Set default imaging details when selected order changes
  useEffect(() => {
    if (liveSelectedOrder) {
      // Parse any existing findings
      const existingNotes = liveSelectedOrder.notes || "";
      const findingsMatch = existingNotes.match(/FINDINGS:\s*([\s\S]*?)(?:\n\nIMPRESSION:|$)/i);
      const impressionMatch = existingNotes.match(/IMPRESSION:\s*([\s\S]*?)$/i);

      setFindings(findingsMatch ? findingsMatch[1].trim() : "");
      setImpression(impressionMatch ? impressionMatch[1].trim() : "");
      setIdentityVerified(liveSelectedOrder.status === "RESULTED");
      setSuccessMsg(null);
      setAttachmentName(liveSelectedOrder.attachment_name || "");
      setAttachmentUri(liveSelectedOrder.attachment_uri || "");
      
      // Reset PACS controls
      setScale(1);
      setBrightness(1);
      setContrast(1);
      setInvert(false);
      setToolActive("none");
      setActiveSeries("axial");
      setShowHeatmap(false);
    }
  }, [liveSelectedOrder?.lab_order_id, liveSelectedOrder?.status]);

  // Determine static asset to display in PACS viewer based on test ordered
  const getImagingAsset = (testName: string) => {
    const nameLower = (testName || "").toLowerCase();
    if (nameLower.includes("ct")) return "/imaging/ct_chest.jpg";
    if (nameLower.includes("mri")) return "/imaging/mri_brain.jpg";
    if (nameLower.includes("x-ray") || nameLower.includes("xray")) return "/imaging/xray_hand.jpg";
    return "/imaging/ct_chest.jpg"; // Default backup
  };

  // Queue Counter calculations
  const getQueueCount = (modality: "CT" | "MRI" | "X-RAY" | "US") => {
    return radiologyOrders.filter((o: any) => {
      const isPendingOrAcquired = o.status === "CONFIRMED" || o.status === "CHECKED_IN" || o.status === "SAMPLE_COLLECTED";
      const testLower = (o.test_name || "").toLowerCase();
      if (!isPendingOrAcquired) return false;
      if (modality === "CT") return testLower.includes("ct");
      if (modality === "MRI") return testLower.includes("mri");
      if (modality === "X-RAY") return testLower.includes("x-ray") || testLower.includes("xray");
      if (modality === "US") return testLower.includes("ultrasound") || testLower.includes("usg");
      return false;
    }).length;
  };

  const handleAcquireScan = async () => {
    if (!liveSelectedOrder) return;
    setCollecting(true);
    try {
      await api.collectLabSample(liveSelectedOrder.lab_order_id);
      refetch();
    } catch (err: any) {
      alert(err?.message || "Failed to mark scan as acquired.");
    } finally {
      setCollecting(false);
    }
  };

  const handleRemoveScan = async () => {
    if (!liveSelectedOrder) return;
    if (!window.confirm("Are you sure you want to remove the current uploaded scan?")) return;
    try {
      await api.clearLabAttachment(liveSelectedOrder.lab_order_id);
      setAttachmentUri("");
      setAttachmentName("");
      refetch();
    } catch (err: any) {
      alert(err?.message || "Failed to remove scan.");
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveSelectedOrder) return;
    if (!identityVerified) {
      alert("Please confirm patient identity verification before submitting radiology report.");
      return;
    }
    setBusy(true);

    const mergedNotes = `FINDINGS: ${findings.trim()}\n\nIMPRESSION: ${impression.trim()}`;
    const mockResults = [
      { analyte: "Findings Class", value: category === "NORMAL" ? 0.0 : category === "BORDERLINE" ? 1.0 : 2.0, unit: null }
    ];

    try {
      await api.submitLabResults(liveSelectedOrder.lab_order_id, {
        results: mockResults,
        notes: mergedNotes,
        attachment_name: attachmentName || null,
        attachment_uri: attachmentUri || null,
      });

      setSuccessMsg(`Radiology report successfully signed and sent for ${liveSelectedOrder.patient_name}'s ${liveSelectedOrder.test_name || "imaging scan"}.`);
      setSelectedOrder(null);
      setFindings("");
      setImpression("");
      setIdentityVerified(false);
      setAttachmentName("");
      setAttachmentUri("");
      refetch();
      qc.invalidateQueries({ queryKey: ["lab"] });
    } catch (err: any) {
      alert(err?.message || "Failed to submit radiology report.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;
    const userMsg = { sender: "user", text: chatQuery };
    setChatHistory(prev => [...prev, userMsg]);
    setTimeout(() => {
      setChatHistory(prev => [...prev, { sender: "copilot", text: "Correlating with prior imaging. Scan from 12 May 2024 shows stable hilar structures. Findings suggest localized embolus." }]);
    }, 800);
    setChatQuery("");
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200" style={{ fontFamily: '"Segoe UI Variable Text","Segoe UI",Inter,sans-serif' }}>
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-left">
        <div>
          <h2 className="text-[16px] font-extrabold text-[#0c3b63]">Radiology Command Center</h2>
          <p className="text-[11.5px] text-slate-500 font-semibold">Live overview of radiology imaging, series processing, and diagnostic reporting.</p>
        </div>
        <span className="live">PACS LIVE CONNECTED</span>
      </div>

      {/* Top Queue Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 text-left">
        {[
          { label: "CT Queue", count: getQueueCount("CT") || 12, color: "#0078d4" },
          { label: "MRI Queue", count: getQueueCount("MRI") || 8, color: "#CA5010" },
          { label: "X-Ray Queue", count: getQueueCount("X-RAY") || 18, color: "#8764B8" },
          { label: "US Queue", count: getQueueCount("US") || 6, color: "#16a34a" },
          { label: "Pending Reports", count: radiologyOrders.filter((o: any) => o.status === "SAMPLE_COLLECTED").length || 24, color: "#D13438" },
          { label: "Critical Results", count: radiologyOrders.filter((o: any) => o.status === "RESULTED" && o.results?.some((r: any) => r.flag && r.flag !== "N")).length || 3, color: "#e11d48" }
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-black/[0.07] bg-white relative overflow-hidden p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: k.color }} />
            <div className="text-[20px] font-extrabold leading-none text-slate-800">{k.count}</div>
            <div className="mt-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Main split grid: Left Workspace and Right Copilot */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_310px]">
        
        {/* Left Side: Worklist, Viewer, Bottom forms */}
        <div className="space-y-4 min-w-0">
          
          {/* Imaging Worklist Row with mod filter */}
          <Card className="p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3 border-b border-black/[0.04] pb-2">
              <h3 className="text-[13.5px] font-extrabold text-[#0c3b63]">Imaging Worklist</h3>
              <div className="flex gap-1.5 overflow-x-auto max-w-full">
                {[
                  { id: "ALL", label: "All" },
                  { id: "CT", label: "CT" },
                  { id: "MRI", label: "MRI" },
                  { id: "X-RAY", label: "X-Ray" },
                  { id: "US", label: "US" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModalityFilter(m.id as any); setSelectedOrder(null); }}
                    className={`px-2.5 py-1 text-[10px] font-extrabold rounded-md border ${
                      modalityFilter === m.id
                        ? "bg-[#0078d4] text-white-force border-[#0078d4] shadow-[0_1px_2px_rgba(0,120,212,0.15)]"
                        : "bg-white text-slate-500 hover:text-slate-850 hover:bg-slate-50 border-black/[0.08]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead>
                  <tr className="border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="pb-2 pr-3">Patient</th>
                    <th className="pb-2 pr-3">MRN</th>
                    <th className="pb-2 pr-3">Modality</th>
                    <th className="pb-2 pr-3">Study Description</th>
                    <th className="pb-2 pr-3">Ordered By</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04] font-semibold text-slate-700">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic">No radiology orders found.</td>
                    </tr>
                  ) : (
                    filteredOrders.map((o: any) => {
                      const isCT = (o.test_name || "").toLowerCase().includes("ct");
                      const isMRI = (o.test_name || "").toLowerCase().includes("mri");
                      const isUS = (o.test_name || "").toLowerCase().includes("ultrasound") || (o.test_name || "").toLowerCase().includes("usg");
                      const modality = isCT ? "CT" : isMRI ? "MRI" : isUS ? "US" : "X-Ray";
                      const isSelected = selectedOrder?.lab_order_id === o.lab_order_id;
                      
                      return (
                        <tr 
                          key={o.lab_order_id} 
                          className={`hover:bg-slate-50/70 transition cursor-pointer ${isSelected ? "bg-[#0078d4]/5 text-[#0078d4]" : ""}`}
                          onClick={() => setSelectedOrder(o)}
                        >
                          <td className="py-2.5 pr-3 font-extrabold text-slate-800">{o.patient_name}</td>
                          <td className="py-2.5 pr-3 font-mono text-[10.5px] text-slate-400">CLN-{o.lab_order_id.slice(-8).toUpperCase()}</td>
                          <td className="py-2.5 pr-3">
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold border bg-slate-55 border-black/[0.08] text-slate-650">{modality}</span>
                          </td>
                          <td className="py-2.5 pr-3">{o.test_name}</td>
                          <td className="py-2.5 pr-3 text-slate-500">{o.ordered_by || "Dr. Ananya Mehta"}</td>
                          <td className="py-2.5 pr-3">
                            {o.status === "CONFIRMED" && <span className="text-amber-600 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded text-[10px]">NOT CHECKED IN</span>}
                            {o.status === "CHECKED_IN" && <span className="text-[#0078d4] bg-blue-50 border border-blue-200/50 px-1.5 py-0.5 rounded text-[10px]">CHECKED IN</span>}
                            {o.status === "SAMPLE_COLLECTED" && <span className="text-[#0078d4] bg-blue-50 border border-blue-200/50 px-1.5 py-0.5 rounded text-[10px]">IN REVIEW</span>}
                            {o.status === "RESULTED" && <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded text-[10px]">READY</span>}
                          </td>
                          <td className="py-2.5">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }}
                              className="text-[#0078d4] hover:underline font-bold text-xs inline-flex items-center gap-1"
                            >
                              Load Study
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* PACS Imaging Viewer Widget with left thumbnails */}
          {liveSelectedOrder && (
            <Card className="p-4 text-left bg-slate-950 border-slate-900 text-slate-100 flex flex-col min-h-[440px] rounded-2xl shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-3">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0078d4]">Imaging Viewer</span>
                <span className="text-xs font-bold text-slate-400 font-mono">
                  {liveSelectedOrder.patient_name} · CLN-{liveSelectedOrder.lab_order_id.slice(-8).toUpperCase()}
                </span>
              </div>

              {(liveSelectedOrder.status === "CONFIRMED" || liveSelectedOrder.status === "CHECKED_IN") ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <div className="text-slate-400 text-sm font-extrabold">⚠️ Scan Acquisition Required</div>
                  <p className="text-slate-500 text-xs max-w-sm">Scan slice capture must be confirmed in EMR database prior to visual loading.</p>
                  <button 
                    onClick={handleAcquireScan}
                    disabled={collecting}
                    className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white-force font-extrabold text-xs py-2 px-4 rounded-xl shadow-lg transition"
                  >
                    {collecting ? "Acquiring..." : "Acquire Diagnostic Scan Slices"}
                  </button>
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-[80px_1fr_60px] gap-3 items-stretch min-h-[340px]">
                  
                  {/* Left Column: Series Thumbnails (Axial, Coronal, Sagittal) */}
                  <div className="flex flex-col gap-2.5 overflow-y-auto pr-1 text-center select-none border-r border-slate-900">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Series</span>
                    {[
                      { id: "axial", label: "Axial", slices: "1-120" },
                      { id: "coronal", label: "Coronal", slices: "1-80" },
                      { id: "sagittal", label: "Sagittal", slices: "1-90" },
                      { id: "lung", label: "Lung", slices: "1-40" }
                    ].map((ser) => (
                      <button 
                        key={ser.id}
                        onClick={() => setActiveSeries(ser.id)}
                        className={`p-1 rounded-lg border text-left transition ${
                          activeSeries === ser.id 
                            ? "border-[#0078d4] bg-slate-900 text-[#0078d4]" 
                            : "border-slate-900 bg-black/40 hover:bg-slate-900/40 text-slate-400"
                        }`}
                      >
                        <div className="h-9 w-full bg-slate-950 rounded flex items-center justify-center overflow-hidden">
                          <img src={getImagingAsset(liveSelectedOrder.test_name || "")} alt="" className="opacity-40 max-h-full object-cover scale-150" />
                        </div>
                        <div className="text-[9px] font-extrabold mt-1 block truncate leading-tight">{ser.label}</div>
                        <div className="text-[8px] text-slate-500 font-semibold">{ser.slices}</div>
                      </button>
                    ))}
                  </div>

                  {/* Center Column: Interactive Main Viewer Viewport */}
                  <div className="relative rounded-xl border border-slate-900 bg-black flex items-center justify-center overflow-hidden min-h-[340px] w-full">
                    {attachmentUri ? (
                      <>
                        <img 
                          src={
                            showHeatmap && gradcamUri
                              ? (gradcamUri.startsWith("http") ? gradcamUri : `${import.meta.env.VITE_API_BASE_URL ?? ""}${gradcamUri}`)
                              : (attachmentUri.startsWith("/imaging")
                                  ? attachmentUri
                                  : attachmentUri.startsWith("http")
                                    ? attachmentUri
                                    : `${import.meta.env.VITE_API_BASE_URL ?? ""}${attachmentUri}`)
                          } 
                          alt="Imaging scan view" 
                          className="max-h-[340px] max-w-full rounded-lg object-contain transition-all duration-200"
                          style={{
                            transform: `scale(${scale})`,
                            filter: `brightness(${brightness}) contrast(${contrast}) ${invert ? "invert(1)" : "invert(0)"}`,
                          }}
                        />
 
                        {/* HUD labels */}
                        <div className="absolute top-3 left-3 text-[9px] text-emerald-400 font-mono leading-relaxed bg-black/50 p-2 rounded border border-emerald-500/15">
                          Name: {liveSelectedOrder.patient_name}<br />
                          MRN: CLN-{liveSelectedOrder.lab_order_id.slice(-8).toUpperCase()}<br />
                          Modality: {liveSelectedOrder.test_name}
                        </div>

                        {/* Remove / Replace Scan button */}
                        <button
                          onClick={handleRemoveScan}
                          className="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[10px] py-1 px-2.5 rounded-lg shadow-lg flex items-center gap-1 transition"
                          title="Remove uploaded scan to replace with another file"
                        >
                          ✕ Remove Scan
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 w-full max-w-sm mx-auto select-none">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#0078d4]/10 text-[#0078d4]">
                          <Upload size={18} className="animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11.5px] font-extrabold text-slate-200">No scan file uploaded</div>
                          <p className="text-[10px] text-slate-500 leading-normal">
                            As a technician, please upload the patient's X-ray or MRI scan image to publish.
                          </p>
                        </div>
                        <div className="pt-1">
                          <input 
                            type="file" 
                            id="radiology-file-upload" 
                            onChange={handleFileChange} 
                            className="hidden" 
                            accept="image/*,application/pdf"
                          />
                          <label 
                            htmlFor="radiology-file-upload"
                            className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white-force font-extrabold text-[10.5px] py-1.5 px-3 rounded-lg shadow-lg cursor-pointer inline-flex items-center gap-1.5 transition"
                          >
                            {uploading ? "Uploading..." : "Upload Patient Scan"}
                          </label>
                        </div>
                        <button 
                          onClick={() => setAttachmentUri(getImagingAsset(liveSelectedOrder.test_name || ""))}
                          className="text-[9.5px] text-[#0078d4] hover:underline font-bold pt-1"
                        >
                          Or load simulated default template
                        </button>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 text-[9px] text-slate-400 font-mono bg-black/50 p-1.5 rounded border border-slate-900">
                      WW: 1500 WL: -600
                    </div>

                    {/* Horizontal Control bar at bottom of center viewport */}
                    <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-xl shadow-lg">
                      <button className="text-[10px] font-extrabold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800">CINE</button>
                      <button className="text-[10px] font-extrabold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800">Layout</button>
                      <button className="text-[10px] font-extrabold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800">Compare</button>
                      <button className="text-[10px] font-extrabold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800">Presets</button>
                    </div>
                  </div>

                  {/* Right Column: Visual adjustments toolbar */}
                  <div className="flex flex-col gap-2 items-center justify-center border-l border-slate-900 pl-2 text-slate-400">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tools</span>
                    <button 
                      onClick={() => { setScale(s => s >= 2 ? 1 : s + 0.25); setToolActive("zoom"); }}
                      className={`p-2 rounded-lg hover:bg-slate-900 transition ${toolActive === "zoom" ? "text-sky-400 bg-slate-900" : ""}`}
                      title="Zoom In"
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button 
                      onClick={() => { setInvert(!invert); setToolActive("invert"); }}
                      className={`p-2 rounded-lg hover:bg-slate-900 transition ${toolActive === "invert" ? "text-sky-400 bg-slate-900" : ""}`}
                      title="Invert Colors"
                    >
                      <Contrast size={15} />
                    </button>
                    <button 
                      onClick={() => { setBrightness(b => b >= 1.5 ? 0.75 : b + 0.25); setToolActive("level"); }}
                      className={`p-2 rounded-lg hover:bg-slate-900 transition ${toolActive === "level" ? "text-sky-400 bg-slate-900" : ""}`}
                      title="Adjust Levels"
                    >
                      <Move size={15} />
                    </button>
                    <button 
                      onClick={() => { setScale(1); setBrightness(1); setContrast(1); setInvert(false); setToolActive("none"); }}
                      className="p-2 rounded-lg hover:bg-slate-900 transition hover:text-white"
                      title="Reset Viewer"
                    >
                      <RotateCcw size={15} />
                    </button>
                    {gradcamUri && (
                      <button 
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className={`p-2 rounded-lg hover:bg-slate-900 transition ${showHeatmap ? "text-amber-400 bg-slate-900 animate-pulse border border-amber-500/20" : "text-slate-400 hover:text-white"}`}
                        title={showHeatmap ? "Show Original Scan" : "Show AI Heatmap (Grad-CAM++)"}
                      >
                        <Sparkles size={15} />
                      </button>
                    )}
                  </div>

                </div>
              )}
            </Card>
          )}

          {/* Bottom details block: Patient Info, Editor, and Priors */}
          {liveSelectedOrder && (
            <div className="grid gap-4 md:grid-cols-3 text-left">
              {/* Patient Info */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-3 pb-1 border-b border-black/[0.04]">Patient Information</h4>
                  <div className="space-y-1.5 text-xs text-slate-700 font-semibold">
                    <div>Patient Name: <b className="text-slate-800">{liveSelectedOrder.patient_name}</b></div>
                    <div>Age/Gender: <b>{p360?.patient?.age ?? "21"} Y / {p360?.patient?.gender ?? "Male"}</b></div>
                    <div>MRN: <b className="font-mono text-[11px] text-slate-500">CLN-{liveSelectedOrder.lab_order_id.slice(-8).toUpperCase()}</b></div>
                    <div>Referring Diagnosis: <b>{(!liveSelectedOrder.notes || liveSelectedOrder.notes.includes("FINDINGS")) ? "Shortness of breath, chest pain" : liveSelectedOrder.notes}</b></div>
                    <div>Height/Weight: <b>{p360?.latest_vitals?.height_cm ?? "178"} cm / {p360?.latest_vitals?.weight_kg ?? "82"} kg</b></div>
                    <div>Allergies: <b className="text-rose-600">{p360?.allergies?.map((a: any) => a.substance).join(", ") || "None / No warnings"}</b></div>
                  </div>
                </div>
                <button className="text-[#0078d4] text-[11px] font-bold text-left hover:underline pt-2">Edit Details</button>
              </Card>

              {/* Report Editor Form */}
              <Card className="p-4 md:col-span-2 text-left flex flex-col justify-between">
                <div>
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-2 pb-1 border-b border-black/[0.04]">Report Details</h4>
                  
                  {/* Rich Text edit helper strip */}
                  <div className="flex gap-1.5 bg-slate-50 border border-black/[0.05] p-1.5 rounded-lg mb-2 text-slate-400 font-extrabold">
                    <button className="px-1.5 py-0.2 hover:bg-slate-200 rounded text-slate-600 font-bold">B</button>
                    <button className="px-1.5 py-0.2 hover:bg-slate-200 rounded text-slate-600 italic">I</button>
                    <button className="px-1.5 py-0.2 hover:bg-slate-200 rounded text-slate-600 underline">U</button>
                    <span className="h-4 w-px bg-black/10 mx-1" />
                    <button className="px-1.5 py-0.2 hover:bg-slate-200 rounded text-[9.5px]">Insert Template</button>
                  </div>

                  <form onSubmit={handleSubmitReport} className="space-y-2 text-xs">
                    <div>
                      <label className="block font-bold text-slate-500 mb-0.5">FINDINGS:</label>
                      <textarea 
                        value={findings} 
                        onChange={(e) => setFindings(e.target.value)} 
                        rows={4} 
                        className="input w-full text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-500 mb-0.5">IMPRESSION:</label>
                      <textarea 
                        value={impression} 
                        onChange={(e) => setImpression(e.target.value)} 
                        rows={2} 
                        className="input w-full text-xs font-mono"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={identityVerified}
                          onChange={(e) => setIdentityVerified(e.target.checked)}
                        />
                        <span className="text-[10px] text-slate-500 font-bold">Confirm patient identity</span>
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy || !identityVerified} className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white-force font-extrabold text-[11px] py-1.5 px-4 rounded-lg shadow transition">
                          {busy ? "Signing..." : "Sign Report"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </Card>
            </div>
          )}

          {!liveSelectedOrder && (
            <div className="py-24 text-center border border-dashed border-black/[0.08] rounded-2xl bg-slate-50/50">
              <Empty>Select an active study from the worklist to load imaging series.</Empty>
            </div>
          )}

        </div>

        {/* Right Side: AI Copilot side pane (Image 1) */}
        <div className="space-y-4 min-w-0">
          <Card className="p-3.5 text-left border border-black/[0.08] shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[580px]">
            <div>
              {/* Copilot Header */}
              <div className="flex items-center gap-2 pb-2.5 border-b border-black/[0.04] mb-3">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#0078d4]/10 text-[#0078d4] shrink-0">
                  <Scan size={14} />
                </span>
                <div>
                  <h4 className="text-[13px] font-extrabold text-slate-800 leading-none flex items-center gap-1.5">
                    AI Copilot <span className="rounded bg-sky-100 px-1 py-0.2 text-[8px] font-extrabold text-[#0078d4] uppercase">Beta</span>
                  </h4>
                  <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">Imaging Analysis Assistant</span>
                </div>
              </div>

              {/* Copilot Tabs */}
              <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-50 border border-black/[0.05] rounded-lg mb-3">
                {[
                  { id: "findings", label: "Findings" },
                  { id: "insights", label: "Insights" },
                  { id: "protocols", label: "Protocols" },
                  { id: "ask", label: "Ask" }
                ].map((ct) => (
                  <button
                    key={ct.id}
                    onClick={() => setCopilotTab(ct.id as any)}
                    className={`py-1 text-[9.5px] font-extrabold rounded transition ${
                      copilotTab === ct.id
                        ? "bg-white text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-black/[0.03]"
                        : "text-slate-500 hover:text-slate-850"
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>

              {/* Findings Tab Content */}
              {copilotTab === "findings" && (
                <div className="space-y-3 text-xs">
                  <div className="p-2 border border-black/[0.04] rounded-lg text-slate-650 bg-slate-50">
                    <span className="text-[9px] font-extrabold text-slate-400 block uppercase">Current Study</span>
                    <b className="text-slate-800 text-[11.5px] block mt-0.5">CT Chest w/ Contrast</b>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">AI Findings Summary</span>
                    <ul className="space-y-1 text-slate-500 font-semibold list-disc pl-3 text-[10.5px]">
                      <li>No pulmonary nodule detected</li>
                      <li>Mild emphysematous changes</li>
                      <li>No pleural effusion</li>
                      <li>Heart size within normal limits</li>
                    </ul>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] text-slate-400">AI Confidence</span>
                      <span className="text-[11.5px] text-emerald-600 font-extrabold">92%</span>
                    </div>
                  </div>

                  {/* Comparison with Prior */}
                  <div className="p-2.5 rounded-xl border border-black/[0.06] bg-slate-50/50 shadow-sm text-left">
                    <span className="text-[9px] font-extrabold text-slate-400 block uppercase">Comparison with Prior</span>
                    <b className="text-slate-800 block text-[11px] mt-0.5">CT Chest - 12 May 2024</b>
                    <span className="text-[10px] text-emerald-650 font-bold block mt-1">No Significant Change</span>
                    <button className="text-[#0078d4] font-bold text-[10px] hover:underline mt-1.5 block">View Comparison</button>
                  </div>

                  {/* Suggested Actions */}
                  <div className="space-y-1.5 pt-2 border-t border-black/[0.04]">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Suggested Actions</span>
                    <div className="space-y-1 text-slate-600 font-semibold text-[10px]">
                      <div className="flex items-center gap-1">✓ Correlate clinically</div>
                      <div className="flex items-center gap-1">✓ Consider PFT if clinically indicated</div>
                      <div className="flex items-center gap-1">✓ Follow-up CT in 12 months (optional)</div>
                    </div>
                  </div>

                  {/* Critical Findings Panel */}
                  <div className="p-2.5 rounded-xl border border-red-500/15 bg-red-500/5 text-slate-700 shadow-sm text-left">
                    <div className="text-[10.5px] font-extrabold text-red-600 flex items-center gap-1">
                      <AlertTriangle size={12} /> Pulmonary Embolism Suspected
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Filling defect in right lower lobe pulmonary artery. AI Confidence: <b>94%</b>
                    </span>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-red-500/10 text-[9px] font-bold">
                      <span className="text-slate-400">10:28 AM</span>
                      <button className="text-red-600 hover:underline">Notify Physician</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Insights Tab Content */}
              {copilotTab === "insights" && (
                <div className="space-y-2 text-xs font-semibold text-slate-500">
                  <p>• Automated segmentation outlines normal aortic arches.</p>
                  <p>• Lung nodule volumes calculated automatically (CADv1.2).</p>
                  <p>• Bone density scores fall within expected standard deviations for patient age.</p>
                </div>
              )}

              {/* Protocols Tab Content */}
              {copilotTab === "protocols" && (
                <div className="space-y-1.5 text-xs font-bold text-slate-600">
                  <div className="p-2 rounded-lg bg-slate-50 border border-black/[0.03]">CT PE Protocol Active</div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-black/[0.03]">Contrast volume: 100 mL Visipaque</div>
                  <div className="p-2 rounded-lg bg-slate-50 border border-black/[0.03]">Slicing matrix: 512 x 512, 0.625mm</div>
                </div>
              )}

              {/* Ask Tab Content */}
              {copilotTab === "ask" && (
                <div className="space-y-2">
                  <div className="h-[220px] overflow-y-auto border border-black/[0.05] rounded-xl bg-slate-50 p-2.5 space-y-2 text-[10.5px] font-semibold text-slate-700 scrollbar-thin">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`p-2 rounded-xl text-left max-w-[85%] ${
                        msg.sender === "copilot"
                          ? "bg-white border border-black/[0.04] mr-auto"
                          : "bg-[#0078d4] text-white-force ml-auto"
                      }`}>
                        {msg.text}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-1.5 pt-1">
                    <input 
                      type="text" 
                      placeholder="Ask anything about this scan..." 
                      className="input text-xs flex-1"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                    />
                    <button type="submit" className="bg-[#0078d4] hover:bg-[#0078d4]/90 p-2 rounded-xl text-white-force shadow">
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}

            </div>

            {/* Quick Ask Suggestion block */}
            <div className="pt-3 border-t border-black/[0.04] text-[10px] space-y-1.5">
              <span className="font-extrabold text-slate-400 uppercase tracking-wider block">Quick Ask</span>
              <button onClick={() => setChatQuery("Identify filling defect")} className="w-full text-left p-1.5 rounded-lg border border-black/[0.04] hover:bg-slate-50 transition text-slate-500 font-semibold truncate">
                Show critical findings
              </button>
              <button onClick={() => setChatQuery("Calculate lung nodule volume")} className="w-full text-left p-1.5 rounded-lg border border-black/[0.04] hover:bg-slate-50 transition text-slate-500 font-semibold truncate">
                Compare with prior CT scan
              </button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
