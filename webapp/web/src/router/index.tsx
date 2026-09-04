import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFoundPage from "@/pages/NotFound";
import LoginPage from "@/pages/Login";
import JobsList from "@/pages/JobsList";
import JobNew from "@/pages/JobNew";
import JobDetail from "@/pages/JobDetail";
import RunsPage from "@/pages/Runs";
import FetchPage from "@/pages/Fetch";
import ParsePage from "@/pages/Parse";
import SessionsPage from "@/pages/Sessions";
import ProxiesPage from "@/pages/Proxies";
import SelectorsPage from "@/pages/Selectors";
import SystemPage from "@/pages/System";
import AIPage from "@/pages/AI";
import UsersPage from "@/pages/Users";
import ApiKeysPage from "@/pages/ApiKeys";
import AuditPage from "@/pages/Audit";
import MagicPage from "@/pages/Magic";
import MapsPage from "@/pages/Maps";
import HomePage from "@/pages/Home";
import HelpPage from "@/pages/Help";
import SolutionsPage from "@/pages/Solutions";
import EcomPage from "@/pages/Ecom";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <Layout>{children}</Layout>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Layout>{children}</Layout>
    </ErrorBoundary>
  );
}
function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute adminOnly>
      <ErrorBoundary>
        <Layout>{children}</Layout>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/", element: <ErrorBoundary><HomePage /></ErrorBoundary> },
  { path: "/help", element: <ProtectedLayout><HelpPage /></ProtectedLayout> },
  { path: "/solutions", element: <PublicLayout><SolutionsPage /></PublicLayout> },
  { path: "/ecom", element: <PublicLayout><EcomPage /></PublicLayout> },
  { path: "/magic", element: <PublicLayout><MagicPage /></PublicLayout> },
  { path: "/magic-demo", element: <PublicLayout><MagicPage /></PublicLayout> },
  { path: "/maps", element: <ProtectedLayout><MapsPage /></ProtectedLayout> },
  { path: "/jobs", element: <ProtectedLayout><JobsList /></ProtectedLayout> },
  { path: "/jobs/new", element: <ProtectedLayout><JobNew /></ProtectedLayout> },
  { path: "/jobs/:id/edit", element: <ProtectedLayout><JobNew /></ProtectedLayout> },
  { path: "/jobs/:id", element: <ProtectedLayout><JobDetail /></ProtectedLayout> },
  { path: "/runs", element: <ProtectedLayout><RunsPage /></ProtectedLayout> },
  { path: "/fetch", element: <ProtectedLayout><FetchPage /></ProtectedLayout> },
  { path: "/parse", element: <ProtectedLayout><ParsePage /></ProtectedLayout> },
  { path: "/sessions", element: <ProtectedLayout><SessionsPage /></ProtectedLayout> },
  { path: "/proxies", element: <ProtectedLayout><ProxiesPage /></ProtectedLayout> },
  { path: "/selectors", element: <ProtectedLayout><SelectorsPage /></ProtectedLayout> },
  { path: "/system", element: <ProtectedLayout><SystemPage /></ProtectedLayout> },
  { path: "/ai", element: <ProtectedLayout><AIPage /></ProtectedLayout> },
  { path: "/users", element: <ProtectedAdminLayout><UsersPage /></ProtectedAdminLayout> },
  { path: "/api-keys", element: <ProtectedAdminLayout><ApiKeysPage /></ProtectedAdminLayout> },
  { path: "/audit", element: <ProtectedAdminLayout><AuditPage /></ProtectedAdminLayout> },
  { path: "*", element: <ErrorBoundary><Layout><NotFoundPage /></Layout></ErrorBoundary> },
]);
