import { Hexagon } from "lucide-react";
import { Card } from "./Card";
import { PageHeader } from "./PageHeader";

/** A module whose backend isn't built yet: the route and nav link stay, the page says so. */
export function ComingSoon({ module, message, bare }: { module: string; message?: string; bare?: boolean }) {
  const card = (
    <Card>
      <div role="status" className="grid justify-items-center gap-3 px-6 py-14 text-center">
        <Hexagon size={28} aria-hidden="true" className="fx-muted" />
        <p className="text-[15px] font-semibold">{module} module — coming soon</p>
        <p className="max-w-85 text-[13px] fx-muted">{message ?? "We're wiring this up next."}</p>
      </div>
    </Card>
  );
  if (bare) return card;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={module} description="Not connected to the backend yet." />
      {card}
    </div>
  );
}
