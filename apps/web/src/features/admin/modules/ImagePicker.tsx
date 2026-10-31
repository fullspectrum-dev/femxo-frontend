"use client";

import { ImagePlus, Undo2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/admin-ui";
import type { ExistingImage } from "./types";

// The API's rules (modules/catalog/src/images.ts), checked here so a bad file fails before any upload.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 8;

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Why a file can't be used, or null. */
export function imageProblem(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return `${file.name}: only JPEG, PNG or WebP images.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: ${mb(file.size)} is over the 5 MB limit.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

export function ImagePicker({
  label,
  existing,
  removed,
  onToggleRemoved,
  files,
  onFilesChange,
}: {
  label: string;
  /** Images already saved (edit form). */
  existing: readonly ExistingImage[];
  /** Ids of saved images that will be deleted when the form is saved. */
  removed: readonly string[];
  onToggleRemoved: (id: string) => void;
  files: readonly File[];
  onFilesChange: (files: File[]) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const kept = existing.filter((image) => !removed.includes(image.id)).length;
  const room = MAX_IMAGES - kept - files.length;

  // Previews are object URLs: made once per file, released when the file goes or the form closes.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(list)) {
      const problem = imageProblem(file);
      if (problem) rejected.push(problem);
      else if (files.some((f) => f.name === file.name && f.size === file.size) || next.length >= room) {
        if (next.length >= room) rejected.push(`${file.name}: a product can have at most ${MAX_IMAGES} images.`);
      } else next.push(file);
    }
    setProblems(rejected);
    if (next.length) onFilesChange([...files, ...next]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div>
        <span className="fx-label" id={`${inputId}-label`}>
          {label}
        </span>
        <p className="mt-1 text-[13px] fx-muted">
          JPEG, PNG or WebP, up to 5 MB each and at least 200 × 200 px, up to {MAX_IMAGES} images. The first one is the main image.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-labelledby={`${inputId}-label`}>
        {existing.map((image) => {
          const isRemoved = removed.includes(image.id);
          return (
            <li key={image.id} className="grid gap-1.5">
              <div className={`relative aspect-square overflow-hidden rounded-[12px] border border-[var(--fx-border)] bg-[var(--fx-lavender-surface)] ${isRemoved ? "opacity-40" : ""}`}>
                {image.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a plain preview of an already-resized API image
                  <img src={image.url} alt={image.alt || "Product image"} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center p-2 text-center text-[12px] fx-muted">
                    {image.status === "rejected" ? `Rejected${image.reason ? `: ${image.reason}` : ""}` : "Processing…"}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                aria-label={isRemoved ? `Keep ${image.alt || "image"}` : `Remove ${image.alt || "image"}`}
                onClick={() => onToggleRemoved(image.id)}
              >
                {isRemoved ? <Undo2 size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                {isRemoved ? "Keep" : "Remove"}
              </Button>
            </li>
          );
        })}
        {files.map((file, index) => (
          <li key={`${file.name}-${file.size}-${index}`} className="grid gap-1.5">
            <div className="relative aspect-square overflow-hidden rounded-[12px] border border-[var(--fx-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob URL) of a file not uploaded yet */}
              <img src={previews[index]} alt={`New image ${file.name}`} className="size-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--fx-primary-text)] px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
            </div>
            <Button size="sm" variant="secondary" aria-label={`Remove ${file.name}`} onClick={() => onFilesChange(files.filter((_, i) => i !== index))}>
              <X size={14} aria-hidden="true" />
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <div>
        <input
          ref={input}
          id={inputId}
          type="file"
          name="images"
          accept={IMAGE_TYPES.join(",")}
          multiple
          className="sr-only"
          onChange={(event) => add(event.target.files)}
        />
        <Button variant="secondary" disabled={room <= 0} onClick={() => input.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          Add images
        </Button>
        <span className="ml-3 text-[13px] fx-muted" aria-live="polite">
          {kept + files.length} of {MAX_IMAGES}
        </span>
      </div>

      {problems.length ? (
        <ul role="alert" className="grid gap-1 text-[13px] text-[var(--fx-danger,#b42318)]">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
