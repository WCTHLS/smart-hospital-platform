import { Navigate, useLocation } from "react-router-dom";
import { getPortalPatient } from "../lib/patientAuth";

export default function RequirePatient({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (getPortalPatient()) return children;

  const redirect = `${location.pathname}${location.search}`;
  return <Navigate to={`/patient/login?redirect=${encodeURIComponent(redirect)}`} replace />;
}
