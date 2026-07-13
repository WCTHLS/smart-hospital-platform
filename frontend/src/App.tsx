import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import CheckIn from "./pages/CheckIn";
import Triage from "./pages/Triage";
import Copilot from "./pages/Copilot";
import LabPortal from "./pages/LabPortal";
import Patient from "./pages/Patient";
import Command from "./pages/Command";
import AdminPortal from "./pages/AdminPortal";
import PatientLogin from "./pages/PatientLogin";
import RequirePatient from "./components/RequirePatient";
import AppointmentBooking from "./pages/AppointmentBooking";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/triage" element={<Triage />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/lab" element={<LabPortal />} />
            <Route path="/patient/login" element={<PatientLogin />} />
            <Route path="/patient" element={<RequirePatient><Patient /></RequirePatient>} />
            <Route path="/patient/checkin" element={<RequirePatient><CheckIn /></RequirePatient>} />
            <Route path="/patient/appointments/book" element={<RequirePatient><AppointmentBooking /></RequirePatient>} />
            <Route path="/command" element={<Command />} />
            <Route path="/admin" element={<AdminPortal />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
