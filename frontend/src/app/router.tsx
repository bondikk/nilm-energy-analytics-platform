import { createBrowserRouter, Navigate } from "react-router-dom";

import { DashboardLayout } from "../components/layout/DashboardLayout";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { AnomaliesPage } from "../pages/AnomaliesPage";
import { LandingPage } from "../pages/LandingPage";
import { NilmLabPage } from "../pages/NilmLabPage";
import { OverviewPage } from "../pages/OverviewPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SimulatorPage } from "../pages/SimulatorPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "analytics", element: <Navigate to="/dashboard/live-nilm" replace /> },
      { path: "live-nilm", element: <AnalyticsPage /> },
      { path: "datasets", element: <NilmLabPage initialMode="datasets" /> },
      { path: "nilm-lab", element: <NilmLabPage initialMode="analysis" /> },
      { path: "anomalies", element: <AnomaliesPage /> },
      { path: "simulator", element: <SimulatorPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/dashboard" replace />,
  },
]);
