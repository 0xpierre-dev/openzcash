import { z } from "zod";

export function sourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const rectangle = {
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().positive().max(1),
  h: z.number().positive().max(1),
  label: z.string().min(1),
};
export const pageManifestSchema = z.array(z.object({
  number: z.number().int().positive(),
  title: z.string(),
  section: z.string(),
  text: z.string(),
  links: z.array(z.union([
    z.object({ ...rectangle, url: z.string().refine((url) => sourceUrl(url) !== null) }),
    z.object({ ...rectangle, page: z.number().int().positive() }),
  ])),
}));
export type ReportPage = z.infer<typeof pageManifestSchema>[number];

export function pageFromHash(hash: string, total: number) {
  const raw = hash.replace(/^#/, "");
  if (!/^\d+$/.test(raw)) return 1;
  return Math.min(total, Math.max(1, Number(raw)));
}

export function fitPage(width: number, height: number, ratio = 16 / 9) {
  const w = Math.max(0, Math.min(width, height * ratio));
  return { width: Math.floor(w), height: Math.floor(w / ratio) };
}

// The module and worker are the same pinned, self-hosted PDF.js distribution.
// Importing only in the browser keeps DOM APIs out of the server render.
type Viewport = { width: number; height: number };
export type RenderTask = { promise: Promise<void>; cancel: () => void };
export type PdfDocument = {
  numPages: number;
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => Viewport;
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }) => RenderTask;
  }>;
};
export type LoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };
type PdfModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: Record<string, unknown>) => LoadingTask;
};
const runtime = "/monthly/pdfjs/5.6.205";
let modulePromise: Promise<PdfModule> | undefined;
export function loadPdfModule(): Promise<PdfModule> {
  if (!modulePromise) {
    const moduleUrl = `${runtime}/pdf.min.mjs`;
    modulePromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl).then((module: PdfModule) => {
      module.GlobalWorkerOptions.workerSrc = `${runtime}/pdf.worker.min.mjs`;
      return module;
    }).catch((error) => { modulePromise = undefined; throw error; });
  }
  return modulePromise;
}

export const pdfOptions = {
  standardFontDataUrl: `${runtime}/standard_fonts/`,
  // Embedded fonts are used directly. PDF JavaScript and eval are never needed.
  isEvalSupported: false,
  useWasm: false,
};
