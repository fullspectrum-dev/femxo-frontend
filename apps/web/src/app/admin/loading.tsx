import { LoadingSkeleton } from "@/components/admin-ui";

export default function PanelLoading() {
  return (
    <div className="grid min-h-dvh place-items-center p-6" role="status" aria-label="Loading">
      <LoadingSkeleton rows={3} />
    </div>
  );
}
