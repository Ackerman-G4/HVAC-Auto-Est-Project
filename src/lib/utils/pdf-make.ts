'use client';

/**
 * Thin wrapper around pdfmake for consistent async loading in Next.js.
 * Call `getPdfMake()` to get a ready-to-use pdfMake instance.
 */

import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPdfMake: any = null;

export async function getPdfMake() {
  if (cachedPdfMake) return cachedPdfMake;

  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfFontsModule = await import('pdfmake/build/vfs_fonts');

  // pdfmake expects vfs to be set globally — handle multiple export shapes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMake: any = (pdfMakeModule as any).default ?? pdfMakeModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fontsModule: any = (pdfFontsModule as any).default ?? pdfFontsModule;
  const vfs = fontsModule?.pdfMake?.vfs ?? fontsModule;

  if (vfs) {
    pdfMake.vfs = vfs;
  }

  cachedPdfMake = pdfMake;
  return pdfMake;
}

/** Convenience: build + download in one call */
export async function createAndDownloadPdf(docDef: TDocumentDefinitions, filename: string) {
  const pdfMake = await getPdfMake();
  pdfMake.createPdf(docDef).download(filename);
}

/** Horizontal line across the content area (A4 width minus default margins) */
export function hrLine(color = '#C8C8C8', width = 515): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: color }],
    margin: [0, 4, 0, 4],
  } as Content;
}

/** Bold text helper that returns proper Content type */
export function boldText(text: string, opts: Record<string, unknown> = {}): Content {
  return { text, bold: true, ...opts } as Content;
}
