"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { AuthUser } from "@/features/auth";
import { BOTTOM_NAV, MORE_ICON } from "../nav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAccessSummary } from "./useAccessSummary";
import { MAX_WIDTH, MIN_WIDTH, RAIL_WIDTH, useSidebarLayout } from "./useSidebarLayout";

/** Layout breakpoints and sidebar behaviour: see useSidebarLayout. */
export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const pathname = usePathname();
  const layout = useSidebarLayout();
  const access = useAccessSummary();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Tablets and desktops expand the pinned sidebar instead; the drawer is for phones.
  const showDrawer = drawerOpen && layout.viewport === "phone";
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    if (showDrawer && !dialog.open) dialog.showModal();
    if (!showDrawer && dialog.open) dialog.close();
  }, [showDrawer]);

  function toggleMenu() {
    if (layout.viewport === "phone") setDrawerOpen(true);
    else layout.toggleSidebar();
  }

  // Ctrl/⌘+B toggles the sidebar, as in VS Code (not while typing).
  const toggleRef = useRef(toggleMenu);
  useEffect(() => {
    toggleRef.current = toggleMenu;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "b" || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      toggleRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const menuLabel =
    layout.viewport === "phone" ? "Open navigation" : layout.rail ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="fx-shell min-h-dvh" data-resizing={layout.resizing}>
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-lg bg-[var(--fx-surface)] px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside
        className="fx-shell-aside fixed inset-y-0 left-0 z-40 hidden md:block"
        style={{ width: layout.pinnedWidth }}
        aria-label="Sidebar"
      >
        <Sidebar
          access={access}
          rail={layout.rail}
          toggle={{ label: menuLabel, expand: layout.rail, onClick: layout.toggleSidebar }}
        />
        {layout.viewport === "desktop" ? <Sash layout={layout} /> : null}
      </aside>

      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-dvh overflow-hidden border-0 bg-transparent p-0 backdrop:bg-[rgba(18,7,31,0.5)]"
        style={{ width: `min(${layout.width}px, 86vw)`, maxWidth: "86vw" }}
        onCancel={(event) => {
          event.preventDefault();
          setDrawerOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false);
        }}
      >
        {showDrawer ? (
          <div className="relative h-full">
            <Sidebar access={access} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-3 top-5 grid h-9 w-9 place-items-center rounded-[10px] text-white/80 hover:bg-white/10"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <Sash layout={layout} drawer />
          </div>
        ) : null}
      </dialog>

      <div className="fx-shell-main flex min-h-dvh min-w-0 flex-col" style={{ paddingLeft: layout.pinnedWidth }}>
        <Topbar user={user} access={access} onMenu={toggleMenu} menuLabel={menuLabel} />
        <main id="admin-main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10 md:pt-6 xl:px-7">
          {children}
        </main>
      </div>

      <nav aria-label="Primary" className="fx-bottom-nav fixed inset-x-0 bottom-0 z-30 md:hidden">
        <ul className="grid grid-cols-4 gap-2 px-4 py-2">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined}>
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" className="w-full" onClick={() => setDrawerOpen(true)}>
              <MORE_ICON size={20} strokeWidth={1.8} aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/**
 * The draggable edge of the pinned sidebar. Drag to resize, drag narrow to
 * collapse to the rail, double-click to reset; ← / → resize from the
 * keyboard and Enter toggles the rail. In the drawer it only resizes.
 */
function Sash({ layout, drawer = false }: { layout: ReturnType<typeof useSidebarLayout>; drawer?: boolean }) {
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    layout.startResize();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -16 : 16;
      if (drawer) layout.nudgeWidth(delta);
      else layout.nudge(delta);
    } else if (event.key === "Enter" && !drawer) {
      event.preventDefault();
      layout.toggleCollapsed();
    }
  }

  return (
    <div
      className={drawer ? "fx-sash fx-sash--inset" : "fx-sash"}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={drawer ? MIN_WIDTH : RAIL_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={drawer ? layout.width : layout.pinnedWidth}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (!layout.resizing) return;
        if (drawer) layout.resizeTo(event.clientX);
        else layout.dragTo(event.clientX);
      }}
      onPointerUp={() => layout.resizing && layout.endResize()}
      onPointerCancel={() => layout.resizing && layout.endResize()}
      onDoubleClick={layout.reset}
      onKeyDown={onKeyDown}
    >
      <span className="fx-sash-grip" aria-hidden="true" />
    </div>
  );
}
