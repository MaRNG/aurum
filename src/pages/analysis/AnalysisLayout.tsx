import { Outlet } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/Tabs";

export function AnalysisLayout() {
  return (
    <>
      <PageHeader title="Analýza" subtitle="Rozpočty, pravidelné platby a neobvyklé výdaje." />
      <TabNav
        tabs={[
          { to: "/analyza", label: "Rozpočty", end: true },
          { to: "/analyza/pravidelne", label: "Pravidelné výdaje" },
          { to: "/analyza/neobvykle", label: "Neobvyklé výdaje" },
        ]}
      />
      <Outlet />
    </>
  );
}
