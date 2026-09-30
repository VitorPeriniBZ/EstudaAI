import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import SubjectPage from "./pages/SubjectPage";
import AdminPage from "./pages/AdminPage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/materia/:id" element={<SubjectPage />} />
        <Route path="/app/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </>
  );
}
