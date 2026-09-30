'use client';

/**
 * Reads the text of a question paper in the browser (nothing is uploaded):
 * PDF via pdf.js, Word (.docx) via mammoth, or plain text.
 */
export class ScannedPdfError extends Error {}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfText(file);
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (name.endsWith('.doc'))
    throw new Error('Old .doc files can’t be read — in Word choose File → Save as → .docx or PDF.');
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/'))
    return file.text();
  throw new Error('Upload a PDF, Word (.docx) or text file.');
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines: pdf.js marks line ends (hasEOL); also break when the y position jumps.
    let out = '';
    let lastY: number | null = null;
    let lastEnd: number | null = null; // x where the previous piece of text ended
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (!out.endsWith('\n')) out += '\n';
      } else if (
        lastEnd !== null &&
        x - lastEnd > 1 &&
        item.str &&
        !out.endsWith(' ') &&
        !out.endsWith('\n') &&
        !item.str.startsWith(' ')
      ) {
        out += ' '; // words placed apart without a space character
      }
      out += item.str;
      if (item.hasEOL) out += '\n';
      lastY = y;
      lastEnd = x + (item.width as number);
    }
    pages.push(out);
    page.cleanup();
  }
  await doc.destroy();
  const text = pages
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  if (text.replace(/\s/g, '').length < 20)
    throw new ScannedPdfError(
      'This PDF has no text inside (it is a scanned image). Export the paper as PDF from Word / Google Docs, or paste the questions as text.',
    );
  return text;
}
