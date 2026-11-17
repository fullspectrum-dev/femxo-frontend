"use client";

import { CloudUpload, Eye, History, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccessDenied, Badge, Button, Card, ConfirmActionDialog, ErrorState, FormField, LoadingSkeleton, PageHeader, Tabs, TextArea, TextInput, useToast } from "@/components/admin-ui";
import { AuthApiError } from "@/features/auth/services/auth-client";
import { api } from "@/lib/api";
import { formatDateTime } from "../format";

/*
 * Company Overview (ADR 0017) against /cms/admin/sections: five fixed sections, each a draft you
 * save and then publish as the next live version. All content is plain text; visitors never see
 * HTML from here.
 */

type SectionKey = "about" | "mission_vision" | "leadership" | "contact" | "certifications";

interface ApiSection {
  key: SectionKey;
  draft: Record<string, unknown> | null;
  rev: number;
  draftUpdatedAt: string | null;
  published: { version: number; content: Record<string, unknown>; publishedAt: string } | null;
  unpublishedChanges: boolean;
}

interface FieldDef {
  name: string;
  label: string;
  kind: "text" | "textarea" | "lines";
  helper?: string;
}

/** Lines of "a | b | c" ↔ an array of objects with these keys. */
const ROWS: Partial<Record<SectionKey, { field: string; keys: string[] }>> = {
  leadership: { field: "people", keys: ["name", "role", "bio"] },
  certifications: { field: "items", keys: ["name", "number", "issuedBy", "validUntil"] },
};

const SECTIONS: { key: SectionKey; label: string; fields: FieldDef[] }[] = [
  {
    key: "about",
    label: "About",
    fields: [
      { name: "title", label: "Headline", kind: "text" },
      { name: "body", label: "About the company", kind: "textarea", helper: "Up to 5,000 characters of plain text." },
    ],
  },
  {
    key: "mission_vision",
    label: "Mission & vision",
    fields: [
      { name: "mission", label: "Mission", kind: "textarea" },
      { name: "vision", label: "Vision", kind: "textarea" },
    ],
  },
  {
    key: "leadership",
    label: "Leadership",
    fields: [{ name: "people", label: "People", kind: "lines", helper: "One person per line: Name | Role | Short bio (bio optional). Up to 20." }],
  },
  {
    key: "contact",
    label: "Contact",
    fields: [
      { name: "address", label: "Address", kind: "textarea" },
      { name: "phones", label: "Phone numbers", kind: "lines", helper: "One per line, up to 5." },
      { name: "emails", label: "Email addresses", kind: "lines", helper: "One per line, up to 5." },
      { name: "hours", label: "Office hours", kind: "text", helper: "Optional, e.g. Mon–Sat, 10am–6pm." },
    ],
  },
  {
    key: "certifications",
    label: "Certifications",
    fields: [
      {
        name: "items",
        label: "Certifications",
        kind: "lines",
        helper: "One per line: Name | Number | Issued by | Valid until (YYYY-MM-DD). Only the name is required.",
      },
    ],
  },
];

type Values = Record<string, string>;

function toValues(key: SectionKey, content: Record<string, unknown> | null | undefined): Values {
  const values: Values = {};
  const rows = ROWS[key];
  for (const field of SECTIONS.find((s) => s.key === key)!.fields) {
    const raw = content?.[field.name];
    if (rows && field.name === rows.field && Array.isArray(raw)) {
      values[field.name] = raw
        .map((entry) => rows.keys.map((k) => String((entry as Record<string, unknown>)[k] ?? "")).join(" | ").replace(/( \| )+$/, ""))
        .join("\n");
    } else if (Array.isArray(raw)) {
      values[field.name] = raw.map(String).join("\n");
    } else {
      values[field.name] = typeof raw === "string" ? raw : "";
    }
  }
  return values;
}

function toContent(key: SectionKey, values: Values): Record<string, unknown> {
  const lines = (name: string) =>
    (values[name] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const rows = ROWS[key];
  const content: Record<string, unknown> = {};
  for (const field of SECTIONS.find((s) => s.key === key)!.fields) {
    if (rows && field.name === rows.field) {
      content[field.name] = lines(field.name).map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        const entry = Object.fromEntries(rows.keys.map((k, i) => [k, parts[i] ?? ""]));
        if ("validUntil" in entry) entry.validUntil = entry.validUntil || (null as unknown as string);
        return entry;
      });
    } else if (field.kind === "lines") {
      content[field.name] = lines(field.name);
    } else {
      content[field.name] = (values[field.name] ?? "").trim();
    }
  }
  return content;
}

const messageOf = (error: unknown) => (error instanceof AuthApiError && error.message ? error.message : "The request failed. Nothing was changed.");

export function CompanyEditor() {
  const toast = useToast();
  const [sections, setSections] = useState<ApiSection[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [active, setActive] = useState<SectionKey>("about");
  // What the person has typed, per section, over the saved text. Cleared when it is saved.
  const [edits, setEdits] = useState<Partial<Record<SectionKey, Values>>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get<{ sections: ApiSection[] }>("/cms/admin/sections")
      .then((res) => {
        if (!live) return;
        setSections(res.sections);
        setState("ready");
      })
      .catch((error) => live && setState(error instanceof AuthApiError && error.status === 403 ? "forbidden" : "error"));
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  const section = sections?.find((s) => s.key === active);
  const def = SECTIONS.find((s) => s.key === active)!;

  // The form starts from the saved draft, or the live text when no draft exists yet.
  const saved = useMemo(() => (section ? toValues(active, section.draft ?? section.published?.content) : {}), [section, active]);
  const values = edits[active] ?? saved;
  const setValues = (update: (v: Values) => Values) => setEdits((all) => ({ ...all, [active]: update(all[active] ?? saved) }));
  const dirty = JSON.stringify(toContent(active, values)) !== JSON.stringify(toContent(active, saved));

  function replace(updated: ApiSection) {
    setSections((list) => list?.map((s) => (s.key === updated.key ? updated : s)) ?? null);
  }

  async function save(): Promise<boolean> {
    if (!section) return false;
    setBusy("save");
    try {
      const res = await api.put<{ section: ApiSection }>(`/cms/admin/sections/${active}/draft`, { rev: section.rev, content: toContent(active, values) });
      replace(res.section);
      setEdits((all) => ({ ...all, [active]: undefined }));
      toast(`${def.label} draft saved.`);
      return true;
    } catch (error) {
      toast(messageOf(error), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish");
    try {
      const res = await api.post<{ section: ApiSection }>(`/cms/admin/sections/${active}/publish`, { note: "Published from the admin panel" });
      replace(res.section);
      toast(`${def.label} is live as version ${res.section.published?.version ?? ""}.`);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Company Overview"
        description="The public About, Leadership and Contact pages. Save a draft, then publish it as the next live version."
        actions={
          <Button variant="secondary" onClick={() => window.open("/", "_blank", "noopener")}>
            <Eye size={16} aria-hidden="true" /> View site
          </Button>
        }
      />

      {state === "loading" ? <LoadingSkeleton rows={6} label="Loading sections" /> : null}
      {state === "error" ? <ErrorState action={<Button variant="secondary" onClick={retry}>Retry</Button>} /> : null}
      {state === "forbidden" ? <AccessDenied /> : null}

      {state === "ready" && sections ? (
        <>
          <Tabs
            label="Company Overview sections"
            idPrefix="cms"
            items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
            value={active}
            onChange={setActive}
          />
          <div id="cms-panel" role="tabpanel" aria-labelledby={`cms-tab-${active}`} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <Card>
              <form
                className="grid gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                {def.fields.map((field) => {
                  const value = values[field.name] ?? "";
                  const onChange = (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field.name]: e.target.value }));
                  return (
                    <FormField key={`${active}-${field.name}`} label={field.label} helper={field.helper}>
                      {({ inputId, describedBy }) => {
                        const common = { id: inputId, "aria-describedby": describedBy, value, onChange };
                        return field.kind === "text" ? <TextInput {...common} /> : <TextArea {...common} rows={field.kind === "lines" ? 6 : 8} />;
                      }}
                    </FormField>
                  );
                })}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" variant="secondary" disabled={!dirty || busy !== null}>
                    <Save size={16} aria-hidden="true" /> {busy === "save" ? "Saving…" : "Save draft"}
                  </Button>
                  <Button type="button" variant="primary" disabled={busy !== null || (!dirty && !section?.unpublishedChanges)} onClick={() => void publish()}>
                    <CloudUpload size={16} aria-hidden="true" /> {busy === "publish" ? "Publishing…" : dirty ? "Save and publish" : "Publish"}
                  </Button>
                </div>
              </form>
            </Card>

            <Card className="h-fit">
              <p className="fx-label">Status</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {section?.published ? <Badge tone="success">Live · v{section.published.version}</Badge> : <Badge tone="neutral">Never published</Badge>}
                {dirty ? <Badge tone="warning">Unsaved edits</Badge> : section?.unpublishedChanges ? <Badge tone="warning">Draft not live</Badge> : null}
              </div>
              <dl className="mt-4 grid gap-3 text-[13px]">
                <div>
                  <dt className="fx-muted">Published</dt>
                  <dd className="font-medium">{section?.published ? formatDateTime(section.published.publishedAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="fx-muted">Draft saved</dt>
                  <dd className="font-medium">{section?.draftUpdatedAt ? formatDateTime(section.draftUpdatedAt) : "—"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-[12px] fx-muted">Every publish is kept as a version, so an earlier text can always be brought back.</p>
              {section ? <VersionHistory key={`${active}-${section.published?.version ?? 0}`} sectionKey={active} label={def.label} liveVersion={section.published?.version ?? null} onRestored={(updated) => { replace(updated); setEdits((all) => ({ ...all, [active]: undefined })); }} /> : null}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface ApiVersion {
  version: number;
  content: unknown;
  publishedBy: string;
  publishedAt: string;
  note: string;
  restoredFrom: number | null;
}

/** GET …/versions (newest first, by cursor) and POST …/rollback, which republishes an old version as a new one. */
function VersionHistory({ sectionKey, label, liveVersion, onRestored }: { sectionKey: SectionKey; label: string; liveVersion: number | null; onRestored: (section: ApiSection) => void }) {
  const toast = useToast();
  const [versions, setVersions] = useState<ApiVersion[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pending, setPending] = useState<ApiVersion | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(after: string | null) {
    setState("loading");
    try {
      const res = await api.get<{ versions: ApiVersion[]; nextCursor: string | null }>(`/cms/admin/sections/${sectionKey}/versions`, { cursor: after ?? undefined, limit: 10 });
      setVersions((list) => (after ? [...list, ...res.versions] : res.versions));
      setCursor(res.nextCursor);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function rollback(version: ApiVersion) {
    setPending(null);
    setBusy(true);
    try {
      const res = await api.post<{ section: ApiSection }>(`/cms/admin/sections/${sectionKey}/rollback`, { version: version.version, note: `Restored version ${version.version} from the admin panel` });
      onRestored(res.section);
      toast(`${label}: version ${version.version} is live again as version ${res.section.published?.version ?? ""}.`);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Version history" className="mt-5 border-t border-[var(--fx-border)] pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="fx-label">Version history</p>
        {state === "idle" ? (
          <Button size="sm" variant="ghost" onClick={() => void load(null)}>
            <History size={14} aria-hidden="true" /> Show
          </Button>
        ) : null}
      </div>
      {state === "error" ? (
        <p className="mt-2 text-[13px] fx-muted">
          Couldn&rsquo;t load the history.{" "}
          <button type="button" className="underline" onClick={() => void load(null)}>
            Retry
          </button>
        </p>
      ) : null}
      {state === "ready" && !versions.length ? <p className="mt-2 text-[13px] fx-muted">Nothing published yet.</p> : null}
      {versions.length ? (
        <ol className="mt-3 grid gap-3">
          {versions.map((v) => (
            <li key={v.version} className="grid gap-1 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">v{v.version}</span>
                {v.version === liveVersion ? <Badge tone="success">Live</Badge> : null}
                {v.restoredFrom !== null ? <span className="fx-muted">restored from v{v.restoredFrom}</span> : null}
              </div>
              <span className="fx-muted">{formatDateTime(v.publishedAt)}</span>
              {v.note ? <span className="break-words">{v.note}</span> : null}
              {v.version !== liveVersion ? (
                <Button size="sm" variant="secondary" className="w-max" disabled={busy} onClick={() => setPending(v)}>
                  <RotateCcw size={14} aria-hidden="true" /> Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {cursor && state !== "loading" ? (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => void load(cursor)}>
          Older versions
        </Button>
      ) : null}
      {state === "loading" ? <p className="mt-2 text-[13px] fx-muted">Loading…</p> : null}
      {pending ? (
        <ConfirmActionDialog
          open
          kind="destructive"
          title={`Restore version ${pending.version}`}
          description="Its text goes live now as a new version and becomes the draft. Unsaved edits in the form are discarded. This can itself be undone."
          record={`${label} · v${pending.version}`}
          confirmLabel="Restore"
          onClose={() => setPending(null)}
          onConfirm={() => void rollback(pending)}
        />
      ) : null}
    </section>
  );
}
