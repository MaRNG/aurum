import { Outlet } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/Tabs";

export function StatsLayout() {
  return (
    <>
      <PageHeader title="Statistiky" subtitle="Historie příjmů, výdajů a kategorií. Převody se nezapočítávají." />
      <TabNav
        tabs={[
          { to: "/statistiky", label: "Vývoj", end: true },
          { to: "/statistiky/kategorie", label: "Kategorie" },
          { to: "/statistiky/porovnani", label: "Meziroční porovnání" },
        ]}
      />
      <Outlet />
    </>
  );
}
