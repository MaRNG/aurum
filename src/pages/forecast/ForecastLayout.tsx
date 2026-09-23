import { Outlet } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/Tabs";

export function ForecastLayout() {
  return (
    <>
      <PageHeader title="Predikce" subtitle="Odhady vycházejí z tvé historie. Nejsou jistotou – vždy je ukazuji jako rozsah." />
      <TabNav
        tabs={[
          { to: "/predikce", label: "Odhady", end: true },
          { to: "/predikce/scenare", label: "Scénáře" },
        ]}
      />
      <Outlet />
    </>
  );
}
