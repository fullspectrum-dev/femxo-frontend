"use client";

import { Button, Card, ErrorState } from "@/components/admin-ui";

/** A screen inside a role panel failed to render: keep the rest of the app, offer a retry. */
export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <ErrorState
          title="This screen didn’t load"
          message="Nothing was changed. Try again, and if it keeps failing tell your admin."
          action={
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          }
        />
      </Card>
    </div>
  );
}
