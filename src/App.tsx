import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Placeholder } from "@/pages/Placeholder";

/** Stránky mimo Přehled se načítají až při první návštěvě (menší úvodní balík). */
function page<T>(loader: () => Promise<T>, name: keyof T) {
  const Component = lazy(async () => ({ default: (await loader())[name] as ComponentType }));
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">Načítám…</div>}>
      <Component />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "mesice", element: page(() => import("@/pages/Months"), "Months") },
      { path: "mesice/:month", element: page(() => import("@/pages/MonthDetail"), "MonthDetail") },
      { path: "transakce", element: page(() => import("@/pages/Transactions"), "Transactions") },
      { path: "ucty", element: page(() => import("@/pages/accounts/Accounts"), "Accounts") },
      { path: "ucty/:id", element: page(() => import("@/pages/accounts/AccountDetail"), "AccountDetail") },
      { path: "cashflow", element: page(() => import("@/pages/Cashflow"), "Cashflow") },
      {
        path: "statistiky",
        element: page(() => import("@/pages/stats/StatsLayout"), "StatsLayout"),
        children: [
          { index: true, element: page(() => import("@/pages/stats/StatsTrend"), "StatsTrend") },
          { path: "kategorie", element: page(() => import("@/pages/stats/StatsCategories"), "StatsCategories") },
          { path: "porovnani", element: page(() => import("@/pages/stats/StatsYears"), "StatsYears") },
        ],
      },
      {
        path: "analyza",
        element: page(() => import("@/pages/analysis/AnalysisLayout"), "AnalysisLayout"),
        children: [
          { index: true, element: page(() => import("@/pages/analysis/Budgets"), "Budgets") },
          { path: "pravidelne", element: page(() => import("@/pages/analysis/Recurring"), "Recurring") },
          { path: "neobvykle", element: page(() => import("@/pages/analysis/Unusual"), "Unusual") },
        ],
      },
      {
        path: "predikce",
        element: page(() => import("@/pages/forecast/ForecastLayout"), "ForecastLayout"),
        children: [
          { index: true, element: page(() => import("@/pages/forecast/Forecasts"), "Forecasts") },
          { path: "scenare", element: page(() => import("@/pages/forecast/Scenarios"), "Scenarios") },
        ],
      },
      { path: "insights", element: page(() => import("@/pages/Insights"), "Insights") },
      { path: "data", element: page(() => import("@/pages/Data"), "Data") },
      { path: "nastaveni", element: page(() => import("@/pages/Settings"), "Settings") },
      { path: "*", element: <Placeholder title="Stránka nenalezena" description="Tato adresa neexistuje." /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
