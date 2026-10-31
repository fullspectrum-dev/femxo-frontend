import { api } from "@/lib/api";
import type { RecordRow } from "../data/records";
import type { CreateSpec, EditSpec, FormFieldSpec, FormValues } from "../modules/types";
import { brandChoices, brandNames, categoryChoices, categoryNames } from "./lookups";
import { PartialSaveError, type LiveService } from "./types";

interface ApiVariant {
  id: string;
  sku: string;
  barcode: string;
  label?: string;
  prices: { purchase: number; dealer: number; subDealer: number; prime: number; selling: number; mrp: number };
}
interface ApiImage {
  id: string;
  alt: string;
  status: string;
  reason: string | null;
  urls: { small: string } | null;
}
interface ApiProduct {
  id: string;
  name: string;
  description: string;
  brandId: string;
  categoryId: string;
  hsnCode: string;
  gstRateBp: number;
  tracking: "none" | "batch" | "batch_expiry";
  shelfLifeDays: number | null;
  variants: ApiVariant[];
  images: ApiImage[];
  status: "active" | "archived";
}

// Shows the first variant's SKU and prices; the API prices every variant separately.
function toRow(p: ApiProduct, brands: Map<string, string>, categories: Map<string, string>): RecordRow {
  const first = p.variants[0];
  return {
    id: p.id,
    name: p.name,
    sku: first?.sku ?? "—",
    brand: brands.get(p.brandId) ?? "—",
    category: categories.get(p.categoryId) ?? "—",
    mrp: first?.prices.mrp ?? null,
    dealerPrice: first?.prices.dealer ?? null,
    gst: p.gstRateBp,
    status: p.status,
  };
}

async function names() {
  // Names are cosmetic: a failed lookup shows dashes rather than failing the list.
  const [brands, categories] = await Promise.all([
    brandNames().catch(() => new Map<string, string>()),
    categoryNames().catch(() => new Map<string, string>()),
  ]);
  return { brands, categories };
}

const GST_CHOICES = ["0%", "0.25%", "3%", "5%", "12%", "18%", "28%", "40%"] as const; // the slabs the API accepts
const TRACKING_CHOICES = { None: "none", Batch: "batch", "Batch + expiry": "batch_expiry" } as const;
const UNIT_CHOICES = ["g", "kg", "ml", "l", "piece"] as const;
// Lowest to highest: the API rejects any other order.
const TIERS = [
  { name: "purchase", label: "Purchase price" },
  { name: "dealer", label: "Dealer price" },
  { name: "subDealer", label: "Sub-dealer price" },
  { name: "prime", label: "Prime price" },
  { name: "selling", label: "Selling price" },
  { name: "mrp", label: "MRP" },
] as const;

const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const money = (name: string, label: string): FormFieldSpec => ({ name, label: `${label} (₹)`, kind: "money", required: true, min: 0.01 });

const coreFields: readonly FormFieldSpec[] = [
  { name: "name", label: "Product name", kind: "text", required: true, placeholder: "Sunflower oil" },
  { name: "description", label: "Description", kind: "textarea", placeholder: "Shown to buyers (optional)", pattern: { regex: /^[\s\S]{0,5000}$/, message: "At most 5000 characters." } },
  { name: "brand", label: "Brand", kind: "select", required: true, options: [] },
  { name: "category", label: "Category", kind: "select", required: true, options: [] },
  { name: "hsn", label: "HSN code", kind: "text", required: true, placeholder: "1512", pattern: { regex: /^\d{4}(\d{2}){0,2}$/, message: "HSN is 4, 6 or 8 digits." } },
  { name: "gst", label: "GST rate", kind: "select", required: true, options: GST_CHOICES },
  { name: "tracking", label: "Stock tracking", kind: "select", required: true, options: Object.keys(TRACKING_CHOICES), helper: "Batch products need a batch number at stock-in; expiry products also an expiry date." },
  { name: "shelfLifeDays", label: "Shelf life (days)", kind: "number", min: 1, helper: "Optional." },
];
const packFields: readonly FormFieldSpec[] = [
  { name: "amount", label: "Pack size", kind: "text", required: true, placeholder: "1", pattern: { regex: /^\d+(\.\d+)?$/, message: "Enter a number such as 1 or 0.5." } },
  { name: "unit", label: "Unit", kind: "select", required: true, options: UNIT_CHOICES },
  { name: "packOf", label: "Pieces in the pack", kind: "number", min: 1, placeholder: "1", helper: "Leave blank for a single unit." },
  { name: "sku", label: "SKU", kind: "text", uppercase: true, placeholder: "Leave blank to generate", helper: "Capital letters, digits and dashes. Can't start with FX-.", pattern: { regex: /^(?!FX-)[A-Z0-9][A-Z0-9-]{1,31}$/, message: "2 to 32 capital letters, digits or dashes, not starting with FX-." } },
];
const barcodeField: FormFieldSpec = { name: "barcode", label: "Barcode", kind: "text", placeholder: "Leave blank to generate", helper: "EAN-8, UPC-A, EAN-13 or GTIN-14 with a correct check digit.", pattern: { regex: /^[\d\s-]{8,30}$/, message: "Digits only, 8 to 14 of them." } };
const priceFields = TIERS.map((tier) => money(tier.name, tier.label));
const imagesField: FormFieldSpec = { name: "images", label: "Product images", kind: "images" };

const createFields: readonly FormFieldSpec[] = [...coreFields, ...packFields, barcodeField, ...priceFields, imagesField];
const editFields: readonly FormFieldSpec[] = [...coreFields, barcodeField, ...priceFields, imagesField];

/** The same ordering rule the API enforces, so the form says it before the request does. */
function checkPrices(values: FormValues): Partial<Record<string, string>> {
  for (let i = 0; i < TIERS.length - 1; i++) {
    const [low, high] = [TIERS[i]!, TIERS[i + 1]!];
    if (Number(values[low.name]) > Number(values[high.name])) {
      return { [low.name]: `${low.label} can't be above the ${high.label.toLowerCase()}. Order: purchase ≤ dealer ≤ sub-dealer ≤ prime ≤ selling ≤ MRP.` };
    }
  }
  return {};
}

let choices: { brands: Map<string, string>; categories: Map<string, string> } | null = null;

/** Active brands and categories as dropdown label → id. Kept so saving can turn the chosen label back into an id. */
async function ensureChoices() {
  const [brands, categories] = await Promise.all([brandChoices(), categoryChoices()]);
  choices = { brands, categories };
  return choices;
}

// ---------------------------------------------------------------- images
async function sha256Base64(file: File): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return btoa(String.fromCharCode(...hash));
}

const reasonOf = (error: unknown) => (error instanceof Error && error.message ? error.message : "unknown error");

/**
 * Uploads each file the way the API wants it: ask for an upload slot, PUT the bytes straight to storage
 * with the headers it names, then confirm. One bad file doesn't stop the rest.
 */
async function uploadImages(productId: string, alt: string, files: File[]): Promise<{ uploaded: number; failures: string[] }> {
  const failures: string[] = [];
  let uploaded = 0;
  for (const file of files) {
    try {
      const slot = await api.post<{ imageId: string; upload: { url: string; headers: Record<string, string> } }>(
        `/catalog/admin/products/${productId}/images/uploads`,
        { contentType: file.type, size: file.size, sha256: await sha256Base64(file) }
      );
      let put: Response;
      try {
        put = await fetch(slot.upload.url, { method: "PUT", headers: slot.upload.headers, body: file });
      } catch {
        throw new Error("the browser couldn't reach image storage (the storage bucket must allow uploads from this site)");
      }
      if (!put.ok) throw new Error(`image storage refused the file (${put.status})`);
      await api.post(`/catalog/admin/products/${productId}/images`, { imageId: slot.imageId, alt });
      uploaded++;
    } catch (error) {
      failures.push(`${file.name}: ${reasonOf(error)}`);
    }
  }
  return { uploaded, failures };
}

// ---------------------------------------------------------------- create
const createSpec: CreateSpec = {
  label: "Add product",
  title: "Add product",
  description: "Creates the product with its first pack size and any images. It is active (visible to buyers) as soon as it is saved. More pack sizes can be added later.",
  fields: createFields,
  status: "active",
  validate: checkPrices,
  // Dropdowns come from the API, so a new brand or category appears without a code change.
  async prepare() {
    const { brands, categories } = await ensureChoices();
    return { brand: [...brands.keys()], category: [...categories.keys()] };
  },
  toRow: (values) => ({ ...values }),
  toast: (values) => `${values.name} added.`,
};

// ---------------------------------------------------------------- edit
/** What the form was filled from, so saving sends only what changed. */
const originals = new Map<string, ApiProduct>();

const labelOf = (map: Map<string, string>, id: string) => [...map].find(([, value]) => value === id)?.[0];

const editSpec: EditSpec = {
  label: "Save changes",
  title: "Edit product",
  description: "Changes apply to buyers right away. Images marked Remove are deleted when you save.",
  fields: editFields,
  validate: checkPrices,
  async load(row) {
    const [{ product }, ch, all] = await Promise.all([
      api.get<{ product: ApiProduct }>(`/catalog/admin/products/${row.id}`),
      ensureChoices(),
      names(),
    ]);
    originals.set(product.id, product);
    // A brand or category archived since the product was made is not in the active lists: keep it selectable.
    const current: [Map<string, string>, string, Map<string, string>][] = [
      [ch.brands, product.brandId, all.brands],
      [ch.categories, product.categoryId, all.categories],
    ];
    for (const [map, id, byId] of current) {
      const name = byId.get(id);
      if (!labelOf(map, id) && name) map.set(name, id);
    }
    const first = product.variants[0]!;
    const values: FormValues = {
      name: product.name,
      description: product.description,
      brand: labelOf(ch.brands, product.brandId) ?? "",
      category: labelOf(ch.categories, product.categoryId) ?? "",
      hsn: product.hsnCode,
      gst: `${product.gstRateBp / 100}%`,
      tracking: Object.entries(TRACKING_CHOICES).find(([, v]) => v === product.tracking)?.[0] ?? "",
      shelfLifeDays: product.shelfLifeDays === null ? "" : String(product.shelfLifeDays),
      barcode: first.barcode,
      ...Object.fromEntries(TIERS.map((tier) => [tier.name, String(first.prices[tier.name] / 100)])),
    };
    const more = product.variants.length > 1 ? ` This product has ${product.variants.length} pack sizes; prices and barcode here are for the first.` : "";
    return {
      values,
      images: product.images.map((image) => ({ id: image.id, alt: image.alt, url: image.urls?.small ?? null, status: image.status, reason: image.reason })),
      note: `Editing pack size ${first.label ?? first.sku} (SKU ${first.sku}). SKU, pack size and unit can't be changed here.${more}`,
      options: { brand: [...ch.brands.keys()], category: [...ch.categories.keys()] },
    };
  },
  toast: (values) => `${values.name} saved.`,
};

export const productsService: LiveService = {
  actions: ["archive", "restore"],
  createSpec,
  editSpec,
  searchPlaceholder: "Filter the products on this page…",
  async list({ q, status, cursor, limit }) {
    const res = await api.get<{ products: ApiProduct[]; nextCursor: string | null }>("/catalog/admin/products", {
      includeArchived: status !== "active",
      cursor,
      limit,
    });
    const { brands, categories } = await names();
    const needle = q?.trim().toLowerCase();
    // The API has no text filter on this list yet, so search and status narrow the loaded page only.
    const items = res.products
      .map((p) => toRow(p, brands, categories))
      .filter(
        (row) =>
          (!status || row.status === status) &&
          (!needle || [row.name, row.sku, row.brand, row.category].some((v) => String(v).toLowerCase().includes(needle)))
      );
    return { items, nextCursor: res.nextCursor, total: null };
  },
  async transition(row, actionKey) {
    const res = await api.post<{ product: ApiProduct }>(`/catalog/admin/products/${row.id}/${actionKey}`);
    const { brands, categories } = await names();
    return toRow(res.product, brands, categories);
  },
  async create(values, files = []) {
    const brandId = choices?.brands.get(String(values.brand));
    const categoryId = choices?.categories.get(String(values.category));
    if (!brandId || !categoryId) throw new Error("Pick a brand and a category from the lists");
    const text = (key: string) => String(values[key] ?? "").trim();
    const prices = Object.fromEntries(TIERS.map((tier) => [tier.name, toPaise(text(tier.name))]));
    const res = await api.post<{ product: ApiProduct }>("/catalog/admin/products", {
      name: text("name"),
      ...(text("description") ? { description: text("description") } : {}),
      brandId,
      categoryId,
      hsnCode: text("hsn"),
      gstRateBp: Math.round(Number.parseFloat(text("gst")) * 100),
      tracking: TRACKING_CHOICES[text("tracking") as keyof typeof TRACKING_CHOICES],
      ...(text("shelfLifeDays") ? { shelfLifeDays: Number(text("shelfLifeDays")) } : {}),
      variants: [
        {
          ...(text("sku") ? { sku: text("sku") } : {}),
          ...(text("barcode") ? { barcode: text("barcode") } : {}),
          packOf: text("packOf") ? Number(text("packOf")) : 1,
          measure: { amount: Number(text("amount")), unit: text("unit") },
          prices,
        },
      ],
    });
    const { brands, categories } = await names();
    const row = toRow(res.product, brands, categories);
    if (files.length) {
      // The product is saved either way; images need its id, so they go up after.
      const { failures } = await uploadImages(res.product.id, text("name"), files);
      if (failures.length) {
        throw new PartialSaveError(
          row,
          `${text("name")} was added, but ${failures.length} of ${files.length} images failed: ${failures.join("; ")}. Open the product and choose Edit to add them again.`
        );
      }
    }
    return row;
  },
  async update(row, values, files, removedImageIds) {
    const before = originals.get(row.id);
    if (!before) throw new Error("Close and reopen the form, then try again");
    const text = (key: string) => String(values[key] ?? "").trim();
    const brandId = choices?.brands.get(text("brand"));
    const categoryId = choices?.categories.get(text("category"));
    if (!brandId || !categoryId) throw new Error("Pick a brand and a category from the lists");
    const done: string[] = [];
    const finish = async () => {
      const { product } = await api.get<{ product: ApiProduct }>(`/catalog/admin/products/${row.id}`);
      originals.set(product.id, product);
      const { brands, categories } = await names();
      return toRow(product, brands, categories);
    };
    try {
      // 1. The first pack size's prices and barcode. Checked most strictly, so first: if refused, nothing else changed.
      const variant = before.variants[0]!;
      const variantPatch: Record<string, unknown> = {};
      const nextPrices = Object.fromEntries(TIERS.map((tier) => [tier.name, toPaise(text(tier.name))]));
      if (TIERS.some((tier) => nextPrices[tier.name] !== variant.prices[tier.name])) variantPatch.prices = nextPrices;
      const barcode = text("barcode").replace(/[\s-]/g, "");
      if (barcode && barcode !== variant.barcode) variantPatch.barcode = barcode;
      if (Object.keys(variantPatch).length) {
        await api.patch(`/catalog/admin/products/${row.id}/variants/${variant.id}`, variantPatch);
        done.push("the prices and barcode");
      }
      // 2. The product's own fields: only those that changed.
      const next = {
        name: text("name"),
        description: text("description"),
        brandId,
        categoryId,
        hsnCode: text("hsn"),
        gstRateBp: Math.round(Number.parseFloat(text("gst")) * 100),
        tracking: TRACKING_CHOICES[text("tracking") as keyof typeof TRACKING_CHOICES],
        shelfLifeDays: text("shelfLifeDays") ? Number(text("shelfLifeDays")) : null,
      };
      const productPatch = Object.fromEntries(Object.entries(next).filter(([key, value]) => before[key as keyof ApiProduct] !== value));
      if (Object.keys(productPatch).length) {
        await api.patch(`/catalog/admin/products/${row.id}`, productPatch);
        done.push("the product details");
      }
      // 3. Images: removals, then uploads. Each is its own request, so report what got through.
      const failures: string[] = [];
      let removedCount = 0;
      for (const id of removedImageIds) {
        try {
          await api.delete(`/catalog/admin/products/${row.id}/images/${id}`);
          removedCount++;
        } catch (error) {
          failures.push(`couldn't remove an image: ${reasonOf(error)}`);
        }
      }
      if (removedCount) done.push(`${removedCount} image removal${removedCount > 1 ? "s" : ""}`);
      if (files.length) {
        const result = await uploadImages(row.id, text("name"), files);
        failures.push(...result.failures);
        if (result.uploaded) done.push(`${result.uploaded} new image${result.uploaded > 1 ? "s" : ""}`);
      }
      if (failures.length) throw new Error(failures.join("; "));
    } catch (error) {
      // Nothing saved yet: let the form stay open with what was typed.
      if (!done.length) throw error;
      throw new PartialSaveError(await finish(), `Saved ${done.join(" and ")}, but not everything: ${reasonOf(error)}`);
    }
    return finish();
  },
};
