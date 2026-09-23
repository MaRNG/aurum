import { Construction } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

export function Placeholder({ title, phase, description }: { title: string; phase?: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={<Construction className="size-5" />} title={phase ? `Připravujeme ve fázi ${phase}` : title}>
          {description}
        </EmptyState>
      </Card>
    </>
  );
}
