"use client";

import { ChevronsLeft, ChevronsRight, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isAdminPrototype } from "../data/data-mode";
import { NAV_GROUPS } from "../nav";
import type { AccessSummary } from "@/features/auth/types/auth";
import { useNavBadges } from "./useNavBadges";
import { describeAccess } from "./useAccessSummary";

/**
 * The dark sidebar: brand, who you're signed in as, the module groups. As a
 * `rail` it shows only icons (labels stay for screen readers and tooltips).
 * The brand stays at the top and the toggle at the foot; the middle scrolls.
 */
export function Sidebar({
  access,
  onNavigate,
  rail = false,
  toggle,
}: {
  /** From GET /access/me; null while loading. */
  access: AccessSummary | null;
  onNavigate?: () => void;
  rail?: boolean;
  /** The expand / collapse button at the foot (left out in the drawer). */
  toggle?: { label: string; expand: boolean; onClick: () => void };
}) {
  const pathname = usePathname();
  const badges = useNavBadges(pathname);
  const who = describeAccess(access);
  const ToggleIcon = toggle?.expand ? ChevronsRight : ChevronsLeft;

  return (
    <div className="fx-sidebar flex h-full flex-col" data-rail={rail}>
      <Link
        href="/admin/dashboard"
        className={cn("flex flex-none items-center gap-3 pb-2 pt-6", rail ? "justify-center px-2" : "px-6")}
        title={rail ? "Femxo · Dashboard" : undefined}
        onClick={onNavigate}
      >
        <Image src="/images/femxo-mark-white.png" alt="" width={390} height={570} className="h-9 w-auto" priority />
        {rail ? (
          <span className="sr-only">Femxo {who.role}</span>
        ) : (
          <span className="leading-none">
            <span className="fx-display block text-[22px] font-bold text-white">Femxo</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">{who.role}</span>
          </span>
        )}
      </Link>

      <div className={cn("fx-scroll min-h-0 flex-1 pb-4", rail ? "px-2" : "pl-4 pr-2")}>
        {rail ? (
          <p className="mx-auto mt-4 grid h-9 w-9 place-items-center rounded-[10px] bg-white/5 text-white/80" title={`Viewing as ${who.role} · ${who.scope}`}>
            <Shield size={16} aria-hidden="true" />
            <span className="sr-only">Viewing as {who.role}, {who.scope}</span>
          </p>
        ) : (
          <div className="fx-sidebar-card mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Viewing as</p>
            <p className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold text-white">
              <Shield size={14} aria-hidden="true" />
              {who.role}
            </p>
            <p className="mt-1 text-[12px] text-white/70">{who.scope}</p>
          </div>
        )}

        <nav aria-label="Admin modules" className="mt-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="fx-nav-group">{group.label}</p>
              <ul className="grid gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const badge = badges[item.key];
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="fx-nav-link"
                        aria-current={active ? "page" : undefined}
                        title={rail ? (badge ? `${item.label} · ${badge} waiting` : item.label) : undefined}
                        onClick={onNavigate}
                      >
                        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        <span className="fx-nav-label">{item.label}</span>
                        {badge ? (
                          <span className="fx-count">
                            {badge}
                            <span className="sr-only"> waiting</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {isAdminPrototype && !rail ? (
          <div className="fx-sidebar-card fx-sidebar-card--proto mt-6">
            <p className="text-[12px] font-semibold text-[#ffd98a]">Prototype mode</p>
            <p className="mt-1 text-[12px] leading-snug text-white/80">
              All figures are sample data. No live integrations are connected.
            </p>
          </div>
        ) : null}
      </div>

      {toggle ? (
        <div className={cn("flex-none border-t border-white/10 py-3", rail ? "px-2" : "px-4")}>
          <button
            type="button"
            className="fx-sidebar-toggle"
            aria-label={toggle.label}
            title={rail ? `${toggle.label} (Ctrl+B)` : undefined}
            onClick={toggle.onClick}
          >
            <ToggleIcon size={18} aria-hidden="true" />
            {rail ? null : (
              <>
                <span>{toggle.label}</span>
                <kbd className="ml-auto text-[11px] text-white/45">Ctrl B</kbd>
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
