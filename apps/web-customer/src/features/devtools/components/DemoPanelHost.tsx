"use client";

import { useEffect, useState } from "react";
import { apiMode } from "@femxo/shared";
import { whenIdle } from "@/lib/idle";
import { loadMockRuntime } from "../runtime";
import { DemoPanel } from "./DemoPanel";

type Controls = Awaited<NonNullable<ReturnType<typeof loadMockRuntime>>>["controls"];

/**
 * Mounts the demo panel in the browser only: the mock runtime (IndexedDB)
 * doesn't exist on the server. It appears once the page is idle, so loading
 * the demo tools never competes with showing the page.
 */
export function DemoPanelHost() {
  const [controls, setControls] = useState<Controls | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancel = whenIdle(() => {
      void loadMockRuntime()?.then((runtime) => !cancelled && setControls(runtime.controls));
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, []);

  return controls ? <DemoPanel controls={controls} mode={apiMode} /> : null;
}
