"use client";

import { Bell, ChevronDown, ChevronRight, CircleQuestionMark, LogOut, Menu, Moon, Search, Sun, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/admin-ui";
import { toggleTheme, useIsDarkTheme } from "@/components/layout/ThemeToggle";
import type { AuthUser } from "@/features/auth";
import type { AccessSummary } from "@/features/auth/types/auth";
import { useAuthSession } from "@/features/auth";
import { forMode, hasBackend } from "../data/api";
import { QUICK_LINKS } from "../data/dashboard";
import { isAdminPrototype } from "../data/data-mode";
import { initials } from "../format";
import { MODULES } from "../modules/registry";
import { findNav } from "../nav";
import { CommandSearch } from "./CommandSearch";
import { Popover } from "./Popover";
import { describeAccess } from "./useAccessSummary";

const BELL_ITEMS = [
  { title: "SMS gateway · OTP queue", meta: "3 retries exhausted", status: "dead_letter", href: "/admin/integrations" },
  { title: "Kosi Distribution Co.", meta: "Dealer KYC waiting for review", status: "in_review", href: "/admin/dealers" },
  { title: "Edible oil 1 L", meta: "Patna WH · 18 units left", status: "low_stock", href: "/admin/warehouse" },
] as const;

// Live mode: only the create forms the API supports (taken from the module registry), never a canned list.
const LIVE_QUICK_LINKS = MODULES.flatMap((module) =>
  module.views.flatMap((view) => {
    const create = hasBackend(view.dataset) ? forMode(view).create : undefined;
    return create ? [{ label: create.label, href: `/admin/${module.key}?create=1` }] : [];
  })
);

export function Topbar({ user, access, onMenu, menuLabel }: { user: AuthUser; access: AccessSummary | null; onMenu: () => void; menuLabel: string }) {
  // Notifications have no API yet: live mode shows none rather than the prototype's sample alerts.
  const bellItems = isAdminPrototype ? BELL_ITEMS : [];
  const quickLinks = isAdminPrototype ? QUICK_LINKS : LIVE_QUICK_LINKS;
  const who = describeAccess(access);
  const pathname = usePathname();
  const isDark = useIsDarkTheme();
  const themeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const ThemeIcon = isDark ? Sun : Moon;
  const router = useRouter();
  const { signOut } = useAuthSession();
  const [mobileSearch, setMobileSearch] = useState(false);
  const nav = findNav(pathname);
  const groupLabel = nav?.group.label.split(" & ")[0];

  return (
    <header className="fx-topbar sticky top-0 z-30">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6 xl:px-7">
        <button type="button" className="fx-icon-btn flex-none" aria-label={menuLabel} title={menuLabel} onClick={onMenu}>
          <Menu size={20} aria-hidden="true" />
        </button>

        {/* Phone: brand + role, as on the Mobile 390 canvas */}
        <div className="min-w-0 flex-1 md:hidden">
          <p className="fx-display text-[19px] font-bold leading-tight">Femxo</p>
          <p className="truncate text-[12px] fx-muted">{who.role}{isAdminPrototype ? " · Staging" : ""}</p>
        </div>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
          <ol className="flex items-center gap-2 whitespace-nowrap text-[13px]">
            <li className="fx-muted">Femxo</li>
            {groupLabel ? (
              <li className="flex items-center gap-2 fx-muted">
                <ChevronRight size={14} aria-hidden="true" />
                {groupLabel}
              </li>
            ) : null}
            {nav ? (
              <li className="flex min-w-0 items-center gap-2 font-semibold" aria-current="page">
                <ChevronRight size={14} className="fx-muted flex-none" aria-hidden="true" />
                <span className="truncate">{nav.item.label}</span>
              </li>
            ) : null}
          </ol>
        </nav>

        <div className="hidden min-w-40 flex-1 md:block">
          <CommandSearch />
        </div>

        {isAdminPrototype ? <span className="fx-env-pill hidden min-[1600px]:inline-flex">Staging · Prototype data</span> : null}

        <button
          type="button"
          className="fx-icon-btn flex-none md:hidden"
          aria-label="Search"
          aria-expanded={mobileSearch}
          onClick={() => setMobileSearch((value) => !value)}
        >
          <Search size={20} aria-hidden="true" />
        </button>

        {quickLinks.length ? (
        <div className="hidden md:block">
          <Popover label="Quick actions" triggerClassName="fx-icon-btn" trigger={<Zap size={19} aria-hidden="true" />}>
            {(close) => (
              <ul>
                <li className="px-3 pb-1 pt-1 fx-label">Quick actions</li>
                {quickLinks.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="fx-menu-item" onClick={close}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
        </div>
        ) : null}

        <Popover
          label="Notifications"
          triggerClassName="fx-icon-btn"
          panelClassName="md:w-[320px]"
          trigger={
            <>
              <Bell size={19} aria-hidden="true" />
              {bellItems.length ? <span className="fx-dot" aria-hidden="true" /> : null}
              <span className="sr-only">{bellItems.length ? `, ${bellItems.length} new` : ", none new"}</span>
            </>
          }
        >
          {(close) => (
            <div>
              <p className="px-3 pb-2 pt-1 fx-label">Needs attention</p>
              {bellItems.length ? null : <p className="px-3 pb-3 text-[13px] fx-muted">Nothing needs attention.</p>}
              <ul>
                {bellItems.map((item) => (
                  <li key={item.title}>
                    <Link href={item.href} className="fx-menu-item items-start justify-between" onClick={close}>
                      <span className="min-w-0">
                        <span className="block font-semibold">{item.title}</span>
                        <span className="block text-[12px] fx-muted">{item.meta}</span>
                      </span>
                      <StatusBadge status={item.status} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/admin/notifications" className="fx-menu-item justify-center font-semibold text-[var(--fx-primary-text)]" onClick={close}>
                View all notifications
              </Link>
            </div>
          )}
        </Popover>

        <button type="button" className="fx-icon-btn hidden flex-none md:inline-grid" aria-label={themeLabel} title={themeLabel} onClick={toggleTheme}>
          <ThemeIcon size={19} aria-hidden="true" />
        </button>

        <div className="hidden lg:block">
          <Popover
            label="Help"
            triggerClassName="fx-icon-btn"
            panelClassName="md:w-[300px]"
            trigger={<CircleQuestionMark size={19} aria-hidden="true" />}
          >
            {() => (
              <div className="grid gap-3 p-3 text-[13px]">
                <p className="fx-label">Shortcuts</p>
                <p className="flex items-center justify-between">
                  Search modules <kbd className="fx-kbd">Ctrl / ⌘ K</kbd>
                </p>
                <p className="flex items-center justify-between">
                  Collapse / expand sidebar <kbd className="fx-kbd">Ctrl / ⌘ B</kbd>
                </p>
                {isAdminPrototype ? (
                  <>
                    <p className="fx-label mt-1">Prototype</p>
                    <p className="fx-muted">
                      Add <code>?state=loading</code>, <code>empty</code>, <code>error</code> or <code>denied</code> to any module URL to
                      preview that state.
                    </p>
                  </>
                ) : null}
              </div>
            )}
          </Popover>
        </div>

        {/* On phones too: it holds the only Sign out. */}
        <div>
          <Popover
            label="Account menu"
            triggerClassName="flex h-11 items-center gap-2 rounded-[14px] border border-[var(--fx-border)] bg-[var(--fx-surface)] px-1.5 shadow-[var(--fx-shelf-control)] md:pr-3"
            panelClassName="md:w-[240px]"
            trigger={
              <>
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--fx-primary)] text-[12px] font-bold text-white" aria-hidden="true">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[120px] truncate text-[13px] font-semibold xl:inline">{user.name}</span>
                <ChevronDown size={16} aria-hidden="true" className="hidden md:block" />
              </>
            }
          >
            {(close) => (
              <div>
                <div className="px-3 pb-2 pt-1">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-[12px] fx-muted">{user.email}</p>
                </div>
                {/* The top bar has no room for the theme button on phones. */}
                <button type="button" className="fx-menu-item md:hidden" onClick={toggleTheme}>
                  <ThemeIcon size={16} aria-hidden="true" /> {themeLabel}
                </button>
                <Link href="/account" className="fx-menu-item" onClick={close}>
                  <UserRound size={16} aria-hidden="true" /> Your account
                </Link>
                <button
                  type="button"
                  className="fx-menu-item"
                  onClick={async () => {
                    close();
                    await signOut();
                    router.replace("/login");
                  }}
                >
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </Popover>
        </div>
      </div>

      {mobileSearch ? (
        <div className="px-4 pb-3 md:hidden">
          <CommandSearch autoFocus />
        </div>
      ) : null}
    </header>
  );
}
