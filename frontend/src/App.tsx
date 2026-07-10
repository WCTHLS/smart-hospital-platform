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
            <Route path="/checkin" element={<CheckIn />} />
            <Route path="/triage" element={<Triage />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/lab" element={<LabPortal />} />
            <Route path="/patient" element={<Patient />} />
            <Route path="/command" element={<Command />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
