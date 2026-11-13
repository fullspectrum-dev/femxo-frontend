"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/** One of the signed-in person's own notifications (GET /notifications). */
export interface StaffNotification {
  id: string;
  event: "order.placed" | "delivery.confirmed" | "cod.collected" | "approval.due" | "report.ready" | "report.failed";
  title: string;
  body: string;
  entityId: string;
  createdAt: string;
  read: boolean;
}

/** Where a notification takes you in the panel. */
export const NOTIFICATION_HREF: Record<StaffNotification["event"], `/admin/${string}`> = {
  "order.placed": "/admin/orders",
  "delivery.confirmed": "/admin/orders",
  "cod.collected": "/admin/orders",
  "approval.due": "/admin/approvals",
  "report.ready": "/admin/reports",
  "report.failed": "/admin/reports",
};

const POLL_MS = 60_000;

/**
 * The bell: the newest notifications and the unread count, refreshed every minute while the tab
 * is visible and whenever the route changes. A failure keeps the last answer instead of blanking it.
 */
export function useNotifications(pathname: string) {
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    Promise.all([
      api.get<{ items: StaffNotification[] }>("/notifications", { limit: 8 }),
      api.get<{ unread: number }>("/notifications/unread-count"),
    ])
      .then(([list, count]) => {
        setItems(list.items);
        setUnread(count.unread);
      })
      .catch(() => undefined); // keep what we had
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, pathname]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    await api.post(`/notifications/${id}/read`, {}).catch(() => undefined);
  }, []);

  return { items, unread, markRead, refresh };
}
