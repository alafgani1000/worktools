import * as pdfjsLib from 'pdfjs-dist';
// Vite query ?url resolves worker script correctly across dev and build
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

/**
 * Load a PDF document cleanly via a centralized helper using patched pdfjs-dist (>=6.5.x).
 */
export function loadPdfDocumentSafe(
  data: Uint8Array | ArrayBuffer,
  options?: { password?: string },
) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return pdfjsLib.getDocument({
    data: bytes,
    ...(options?.password !== undefined ? { password: options.password } : {}),
  });
}

/**
 * Render a single PDF page into a canvas
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number = 1.5
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Canvas 2D context not available');
  }
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;
  
  return canvas;
}

/**
 * Render a single PDF page as a lightweight Data URL thumbnail
 */
export async function renderPageThumbnail(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number = 300
): Promise<string> {
  const page = await pdfDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = maxWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Canvas 2D context not available');
  }
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;
  
  return canvas.toDataURL('image/jpeg', 0.85);
}
