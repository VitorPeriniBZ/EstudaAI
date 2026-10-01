import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import Landing from "./pages/Landing";

// cada página vira um arquivo separado: quem abre a landing não baixa o admin
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SubjectPage = lazy(() => import("./pages/SubjectPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacidade = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacidade })));
const Termos = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Termos })));

function PageLoading() {
  return (
    <div className="min-h-screen grid place-items-center" role="status" aria-live="polite">
      <span className="typing text-muted-foreground" aria-hidden><i /><i /><i /></span>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/materia/:id" element={<SubjectPage />} />
          <Route path="/app/admin" element={<AdminPage />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-center" />
    </>
  );
}
