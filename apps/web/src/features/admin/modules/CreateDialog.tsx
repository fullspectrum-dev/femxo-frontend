"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { Button, Dialog, FormField, SelectInput, TextArea, TextInput, useToast } from "@/components/admin-ui";
import { PartialSaveError, createRecord, isLive, updateRecord } from "../data/api";
import type { DatasetKey, RecordRow } from "../data/records";
import { ImagePicker } from "./ImagePicker";
import type { CreateSpec, EditSpec, ExistingImage, FormFieldSpec, FormValues } from "./types";

/** A zod rule per field, built from the module spec (same rules the API will use). */
function fieldSchema(field: FormFieldSpec) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const fail = (message: string) => ctx.addIssue({ code: "custom", message });
      if (!value) {
        if (field.required) fail(`${field.label.replace(/ \(.*\)$/, "")} is required.`);
        return;
      }
      if (field.kind === "number" || field.kind === "money") {
        const number = Number(value);
        if (!Number.isFinite(number)) return fail("Enter a number.");
        if (field.kind === "number" && !Number.isInteger(number)) return fail("Enter a whole number.");
        if (field.kind === "money" && !/^\d+(\.\d{1,2})?$/.test(value)) return fail("Enter an amount in rupees, up to 2 decimals.");
        if (field.min !== undefined && number < field.min) return fail(`Must be at least ${field.min}.`);
      }
      if (field.pattern && !field.pattern.regex.test(value)) fail(field.pattern.message);
    });
}

function validate(
  fields: readonly FormFieldSpec[],
  crossField: ((values: FormValues) => Partial<Record<string, string>>) | undefined,
  values: FormValues
): Partial<Record<string, string>> {
  // An images field holds files, not text: the picker checks those itself.
  const shape = Object.fromEntries(fields.filter((field) => field.kind !== "images").map((field) => [field.name, fieldSchema(field)]));
  const result = z.object(shape).safeParse(values);
  const errors: Partial<Record<string, string>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      errors[key] ??= issue.message;
    }
  }
  // Cross-field rules only once each field is valid on its own.
  return Object.keys(errors).length ? errors : (crossField?.(values) ?? {});
}

const emptyValues = (fields: readonly FormFieldSpec[]): FormValues => Object.fromEntries(fields.map((field) => [field.name, ""]));

interface Loaded {
  values: FormValues;
  images: ExistingImage[];
  note?: string;
  options?: Record<string, readonly string[]>;
}

/** The form shared by "create" and "edit": fields, validation, dropdown options, images, saving. */
function FormDialog({
  formId,
  open,
  title,
  description,
  submitLabel,
  fields,
  crossField,
  prepare,
  load,
  onSubmit: save,
  onClose,
}: {
  formId: string;
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  fields: readonly FormFieldSpec[];
  crossField?: (values: FormValues) => Partial<Record<string, string>>;
  /** Live forms: dropdown options from the API, fetched when the dialog opens. */
  prepare?: () => Promise<Record<string, readonly string[]>>;
  /** Edit forms: the record's current values, fetched when the dialog opens. */
  load?: () => Promise<Loaded>;
  /** Saves. Throws to keep the dialog open with what was typed. */
  onSubmit: (values: FormValues, files: File[], removedImageIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(() => emptyValues(fields));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<Record<string, readonly string[]>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [ready, setReady] = useState(!load);
  const [existing, setExisting] = useState<ExistingImage[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState<string | undefined>();

  useEffect(() => {
    if (!open || (!prepare && !load)) return;
    let active = true;
    const work: Promise<void>[] = [];
    if (prepare) {
      work.push(
        prepare().then((loaded) => {
          if (active) setOptions((current) => ({ ...loaded, ...current }));
        })
      );
    }
    if (load) {
      work.push(
        load().then((loaded) => {
          if (!active) return;
          setValues({ ...emptyValues(fields), ...loaded.values });
          setExisting(loaded.images);
          setNote(loaded.note);
          // The record's own choices win, so an archived brand it still uses stays selectable.
          if (loaded.options) setOptions((current) => ({ ...current, ...loaded.options }));
        })
      );
    }
    Promise.all(work).then(
      () => {
        if (!active) return;
        setLoadFailed(false);
        setReady(true);
      },
      () => active && setLoadFailed(true)
    );
    return () => {
      active = false;
    };
  }, [open, prepare, load, fields]);

  const errors = validate(fields, crossField, values);
  const visibleError = (name: string) => (submitted || touched[name] ? errors[name] : undefined);

  const close = () => {
    setValues(emptyValues(fields));
    setTouched({});
    setSubmitted(false);
    setFiles([]);
    setRemoved([]);
    onClose();
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      // Move focus to the first invalid field, so keyboard users land on it.
      const first = fields.find((field) => errors[field.name]);
      const form = event.currentTarget as HTMLFormElement;
      form.querySelector<HTMLElement>(`[name="${first?.name}"]`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
      await save(trimmed, files, removed);
      close();
    } catch (error) {
      // In live mode the API says why (e.g. "SKU already used"); the form keeps what was typed.
      const reason = isLive && error instanceof Error && error.message ? `${error.message}. ` : "";
      toast(`Couldn't save. ${reason}Your changes are still in the form.`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={saving || !ready}>
            {saving ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      {loadFailed ? (
        <p role="alert" className="mb-3 text-[13px] text-[var(--fx-danger,#b42318)]">
          Couldn&apos;t load this form&apos;s data from the server. Close and reopen it to retry.
        </p>
      ) : null}
      {note ? <p className="mb-3 text-[13px] fx-muted">{note}</p> : null}
      {!ready && !loadFailed ? <p className="mb-3 text-[13px] fx-muted">Loading…</p> : null}
      <form id={formId} noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2" hidden={!ready}>
        {fields.map((field) => {
          if (field.kind === "images") {
            return (
              <ImagePicker
                key={field.name}
                label={field.label}
                existing={existing}
                removed={removed}
                onToggleRemoved={(id) => setRemoved((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))}
                files={files}
                onFilesChange={setFiles}
              />
            );
          }
          const error = visibleError(field.name);
          const common = {
            name: field.name,
            value: values[field.name] ?? "",
            placeholder: field.placeholder,
            onBlur: () => setTouched((current) => ({ ...current, [field.name]: true })),
          };
          const setValue = (value: string) =>
            setValues((current) => ({ ...current, [field.name]: field.uppercase ? value.toUpperCase() : value }));
          return (
            <FormField
              key={field.name}
              label={field.label}
              required={field.required}
              helper={field.helper}
              error={error}
              className={field.kind === "textarea" || fields.length < 4 ? "sm:col-span-2" : undefined}
            >
              {({ inputId, describedBy, invalid }) => {
                const aria = { id: inputId, "aria-describedby": describedBy, "aria-invalid": invalid || undefined, "aria-required": field.required || undefined };
                if (field.kind === "select") {
                  return (
                    <SelectInput {...common} {...aria} onChange={(event) => setValue(event.target.value)}>
                      <option value="">Select…</option>
                      {(options[field.name] ?? field.options)?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectInput>
                  );
                }
                if (field.kind === "textarea") {
                  return <TextArea {...common} {...aria} onChange={(event) => setValue(event.target.value)} />;
                }
                return (
                  <TextInput
                    {...common}
                    {...aria}
                    type={field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : "text"}
                    inputMode={
                      // The numeric keypad has no minus sign, so signed fields keep the full keyboard.
                      field.kind === "number" && field.min !== undefined && field.min >= 0
                        ? "numeric"
                        : field.kind === "money"
                          ? "decimal"
                          : field.kind === "tel"
                            ? "tel"
                            : undefined
                    }
                    autoComplete="off"
                    onChange={(event) => setValue(event.target.value)}
                  />
                );
              }}
            </FormField>
          );
        })}
      </form>
    </Dialog>
  );
}

/** What to tell the user when the record saved but a follow-up step (an image) did not. */
function usePartialToast() {
  const toast = useToast();
  return (error: PartialSaveError) => toast(error.message, "error");
}

export function CreateDialog({
  spec,
  dataset,
  open,
  onClose,
  onCreated,
}: {
  spec: CreateSpec;
  dataset: DatasetKey;
  open: boolean;
  onClose: () => void;
  onCreated: (row: RecordRow) => void;
}) {
  const toast = useToast();
  const partial = usePartialToast();
  return (
    <FormDialog
      formId={`create-${dataset}`}
      open={open}
      title={spec.title}
      description={spec.description}
      submitLabel={spec.label}
      fields={spec.fields}
      crossField={spec.validate}
      prepare={spec.prepare}
      onClose={onClose}
      onSubmit={async (values, files) => {
        try {
          const row = await createRecord(dataset, spec.toRow(values), spec.status, files);
          toast(spec.toast(values));
          onCreated(row);
        } catch (error) {
          if (!(error instanceof PartialSaveError)) throw error;
          // The record exists: close the form and refresh, but say clearly what is missing.
          partial(error);
          onCreated(error.row);
        }
      }}
    />
  );
}

/** Edit form for one record. Mounted only while open (and keyed by the record), so each open starts from the server's values. */
export function EditDialog({
  spec,
  dataset,
  row,
  onClose,
  onSaved,
}: {
  spec: EditSpec;
  dataset: DatasetKey;
  row: RecordRow;
  onClose: () => void;
  onSaved: (row: RecordRow) => void;
}) {
  const toast = useToast();
  const partial = usePartialToast();
  const [load] = useState(() => () => spec.load(row));
  return (
    <FormDialog
      formId={`edit-${dataset}`}
      open
      title={spec.title}
      description={spec.description}
      submitLabel={spec.label}
      fields={spec.fields}
      crossField={spec.validate}
      load={load}
      onClose={onClose}
      onSubmit={async (values, files, removedImageIds) => {
        try {
          const saved = await updateRecord(dataset, row, values, files, removedImageIds);
          toast(spec.toast(values));
          onSaved(saved);
        } catch (error) {
          if (!(error instanceof PartialSaveError)) throw error;
          partial(error);
          onSaved(error.row);
        }
      }}
    />
  );
}
