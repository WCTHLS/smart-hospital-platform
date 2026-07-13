import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import PatientCheckIn from "./features/patient/PatientCheckIn";
import PatientTriage from "./features/patient/PatientTriage";
import DoctorWorkspace from "./features/doctor/DoctorWorkspace";
import LabWorkspace from "./features/lab/LabWorkspace";
import PatientDashboard from "./features/patient/PatientDashboard";
import CommandCenter from "./features/admin/CommandCenter";
import AdminPortal from "./features/admin/AdminPortal";
import PatientLogin from "./features/patient/PatientLogin";
import RequirePatient from "./components/RequirePatient";
import AppointmentBooking from "./features/patient/AppointmentBooking";

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
            <Route path="/triage" element={<PatientTriage />} />
            <Route path="/copilot" element={<DoctorWorkspace />} />
            <Route path="/lab" element={<LabWorkspace />} />
            <Route path="/patient/login" element={<PatientLogin />} />
            <Route path="/patient" element={<RequirePatient><PatientDashboard /></RequirePatient>} />
            <Route path="/patient/checkin" element={<RequirePatient><PatientCheckIn /></RequirePatient>} />
            <Route path="/patient/appointments/book" element={<RequirePatient><AppointmentBooking /></RequirePatient>} />
            <Route path="/command" element={<CommandCenter />} />
            <Route path="/admin" element={<AdminPortal />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
