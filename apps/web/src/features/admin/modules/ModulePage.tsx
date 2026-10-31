"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  ComingSoon,
  ConfirmActionDialog,
  DataTable,
  EmptyState,
  PageHeader,
  STATUS_META,
  Tabs,
  useToast,
} from "@/components/admin-ui";
import type { Column, SortState } from "@/components/admin-ui";
import { MockApiError, applyAction, forMode, hasBackend, isLive, listRecords, readPreviewState } from "../data/api";
import type { Page, PreviewState } from "../data/api";
import type { RecordRow } from "../data/records";
import { CreateDialog, EditDialog } from "./CreateDialog";
import { DetailDrawer } from "./DetailDrawer";
import { renderColumn } from "./cells";
import { amountOf, getModule } from "./registry";
import type { ActionSpec, ModuleSpec, ViewSpec } from "./types";

const DEFAULT_PAGE_SIZE = 6;

/** Any admin module: tabs for its views, each a searchable, paged list with details and actions. */
export function ModulePage({ moduleKey }: { moduleKey: ModuleSpec["key"] }) {
  const spec = getModule(moduleKey);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Read from the router (not once on mount), so a Quick action link to
  // ?create=1 works while already on this module. Next keeps visited modules
  // mounted but hidden and they see the current URL too, so only the module
  // being shown may act on it.
  const isShown = pathname === `/admin/${spec.key}`;
  const preview = readPreviewState(searchParams);
  const views = useMemo(() => spec.views.map(forMode), [spec]);
  const createView = views.find((entry) => entry.create);
  const createFromUrl = isShown && searchParams.get("create") === "1" && createView !== undefined;
  const [viewKey, setViewKey] = useState((views.find((entry) => hasBackend(entry.dataset)) ?? views[0]!).key);
  const [createOpenState, setCreateOpen] = useState(false);
  const view = createFromUrl ? createView : (views.find((entry) => entry.key === viewKey) ?? views[0]!);
  const createOpen = createOpenState || createFromUrl;
  const tabsId = `module-${spec.key}`;

  // Drops ?create=1 once handled, so a reload doesn't reopen the form.
  function closeCreate() {
    setCreateOpen(false);
    if (!createFromUrl) return;
    setViewKey(view.key);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (preview === "denied") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <PageHeader title={spec.title} description={spec.description} />
        <Card>
          <AccessDenied
            action={
              <Link href="/admin/dashboard" className="fx-btn fx-btn--secondary">
                Back to dashboard
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  // One minmax(0, 1fr) column, so a wide table scrolls inside its card instead
  // of widening the whole page on tablets.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={spec.title}
        description={spec.description}
        actions={
          view.create && !view.readOnly ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              {view.create.label}
            </Button>
          ) : view.readOnly ? (
            <Badge tone="neutral" plain>
              Read-only
            </Badge>
          ) : undefined
        }
      />

      {spec.views.length > 1 ? (
        <Tabs
          label={`${spec.title} sections`}
          idPrefix={tabsId}
          items={views.map((entry) => ({ key: entry.key, label: entry.label }))}
          value={view.key}
          onChange={(key) => {
            closeCreate();
            setViewKey(key);
          }}
        />
      ) : null}

      <div
        id={`${tabsId}-panel`}
        role={spec.views.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={spec.views.length > 1 ? `${tabsId}-tab-${view.key}` : undefined}
      >
        {hasBackend(view.dataset) ? (
          <ViewPanel
            key={view.key}
            view={view}
            preview={preview}
            createOpen={createOpen}
            onCreateClose={closeCreate}
            onCreateOpen={() => setCreateOpen(true)}
          />
        ) : (
          <ComingSoon module={views.length > 1 ? `${spec.title} · ${view.label}` : spec.title} bare />
        )}
      </div>
    </div>
  );
}

interface Query {
  q: string;
  status: string;
  sort: SortState | undefined;
}

function ViewPanel({
  view,
  preview,
  createOpen,
  onCreateOpen,
  onCreateClose,
}: {
  view: ViewSpec;
  preview: PreviewState;
  createOpen: boolean;
  onCreateOpen: () => void;
  onCreateClose: () => void;
}) {
  const toast = useToast();
  const pageSize = view.pageSize ?? DEFAULT_PAGE_SIZE;
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState<Query>({ q: "", status: "", sort: undefined });
  // Cursor stack: the last entry is the current page; popping goes back.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; page: Page | null; failed: boolean }>({ key: "", page: null, failed: false });
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [pending, setPending] = useState<{ action: ActionSpec; row: RecordRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const cursor = cursors.at(-1) ?? null;
  const requestKey = JSON.stringify([view.dataset, query, cursor, reload]);
  const loading = result.key !== requestKey;

  // Debounce typing so each keystroke doesn't fire a request.
  useEffect(() => {
    if (searchInput === query.q) return;
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, q: searchInput }));
      setCursors([null]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, query.q]);

  useEffect(() => {
    let active = true;
    listRecords(
      view.dataset,
      { q: query.q, searchKeys: view.searchKeys, status: query.status || undefined, sort: query.sort, cursor, limit: pageSize },
      preview
    )
      .then((page) => {
        if (!active) return;
        // An action can empty the last page (the row left the filter); step back.
        if (page.items.length === 0 && cursor !== null) setCursors((stack) => stack.slice(0, -1));
        else setResult({ key: requestKey, page, failed: false });
      })
      .catch(() => active && setResult({ key: requestKey, page: null, failed: true }));
    return () => {
      active = false;
    };
  }, [requestKey, view, query, cursor, pageSize, preview]);

  const columns = useMemo<Column<RecordRow>[]>(
    () =>
      view.columns.map((column) => ({
        key: column.key,
        header: column.header,
        sortable: column.sortable,
        primary: column.primary,
        hideOnMobile: column.hideOnMobile,
        align: column.format === "inr" || column.format === "count" || column.format === "units" ? "right" : "left",
        render: (row: RecordRow) => renderColumn(column, row),
      })),
    [view]
  );

  async function run(action: ActionSpec, row: RecordRow) {
    setPending(null);
    if (!action.to) {
      toast(action.toast(row));
      return;
    }
    setBusy(true);
    try {
      const updated = await applyAction(view.dataset, row, action);
      setSelected(updated);
      setReload((n) => n + 1);
      toast(action.toast(updated));
    } catch (error) {
      toast(
        error instanceof MockApiError && error.code === "INVALID_TRANSITION"
          ? isLive && error.message
            ? `${error.message}. Nothing was changed.`
            : "This record changed meanwhile. Refreshed with the latest state."
          : "Couldn't apply the action. Nothing was changed.",
        "error"
      );
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const page = result.page;
  const from = (cursors.length - 1) * pageSize + 1;
  const isFiltered = Boolean(query.q || query.status);

  return (
    <>
      <DataTable<RecordRow>
        label={view.label}
        columns={columns}
        rows={loading ? [] : (page?.items ?? [])}
        getRowId={(row) => row.id}
        state={loading ? "loading" : result.failed ? "error" : "ready"}
        onRetry={() => setReload((n) => n + 1)}
        search={{ value: searchInput, onChange: setSearchInput, placeholder: view.searchPlaceholder }}
        statusFilter={
          view.statuses.length
            ? {
                value: query.status,
                onChange: (status) => {
                  setQuery((current) => ({ ...current, status }));
                  setCursors([null]);
                },
                options: view.statuses.map((status) => ({ value: status, label: STATUS_META[status].label })),
              }
            : undefined
        }
        sort={query.sort}
        onSortChange={(sort) => {
          setQuery((current) => ({ ...current, sort }));
          setCursors([null]);
        }}
        onView={setSelected}
        empty={
          isFiltered ? (
            <EmptyState title="No matches" message="Try a different search or status filter." />
          ) : (
            <EmptyState
              title={view.empty.title}
              message={view.empty.message}
              action={
                view.create ? (
                  <Button variant="primary" onClick={onCreateOpen}>
                    {view.create.label}
                  </Button>
                ) : undefined
              }
            />
          )
        }
        pager={
          page
            ? {
                summary:
                  page.total === null
                    ? `Showing ${from}–${from + page.items.length - 1} · Cursor-based pagination`
                    : `Showing ${from}–${from + page.items.length - 1} of ${page.total} · Cursor-based pagination`,
                hasPrevious: cursors.length > 1,
                hasNext: page.nextCursor !== null,
                onPrevious: () => setCursors((stack) => stack.slice(0, -1)),
                onNext: () => setCursors((stack) => [...stack, page.nextCursor]),
              }
            : undefined
        }
      />

      <DetailDrawer
        view={view}
        row={selected}
        busy={busy}
        onClose={() => setSelected(null)}
        onAction={(action, row) => (action.confirm ? setPending({ action, row }) : void run(action, row))}
        onEdit={view.edit ? setEditing : undefined}
      />

      {view.edit && editing ? (
        <EditDialog
          key={editing.id}
          spec={view.edit}
          dataset={view.dataset}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSelected(saved);
            setReload((n) => n + 1);
          }}
        />
      ) : null}

      {pending?.action.confirm ? (
        <ConfirmActionDialog
          open
          kind={pending.action.confirm.kind}
          title={pending.action.confirm.title}
          description={pending.action.confirm.description}
          amount={amountOf(pending.row, pending.action.confirm.amountKey)}
          record={view.recordName(pending.row)}
          confirmLabel={pending.action.confirm.confirmLabel}
          onClose={() => setPending(null)}
          onConfirm={() => void run(pending.action, pending.row)}
        />
      ) : null}

      {view.create ? (
        <CreateDialog
          spec={view.create}
          dataset={view.dataset}
          open={createOpen}
          onClose={onCreateClose}
          onCreated={() => {
            setQuery({ q: "", status: "", sort: undefined });
            setSearchInput("");
            setCursors([null]);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}
