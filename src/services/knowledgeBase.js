const fs = require('node:fs/promises');
const path = require('node:path');
const { log, error: logError } = require('../utils/logger');

async function extractPdfPages(filePath) {
  log('KnowledgeBase', 'Reading PDF file', { filePath });
  const buffer = await fs.readFile(filePath);
  log('KnowledgeBase', 'PDF file read', { filePath, bytes: buffer.length });
  try {
    const pdfjsLib = require('pdfjs-dist/build/pdf.js');
    const standardFontDataUrl = path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts/'
    );
    const document = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      isEvalSupported: false,
      standardFontDataUrl,
      useSystemFonts: true
    }).promise;
    const pages = [];

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false
        });
        const text = content.items.map((item) => item.str).join(' ');
        pages.push(text);
        page.cleanup();
      }
    } finally {
      await document.destroy();
    }

    if (!pages.some((text) => text.trim())) {
      throw new Error('PDF contains no extractable text');
    }
    log('KnowledgeBase', 'PDF text extracted', { filePath, pageCount: pages.length });
    return pages;
  } catch (error) {
    logError('KnowledgeBase', 'PDF parsing failed', { filePath, message: error.message });
    throw new Error(`Could not parse PDF ${filePath}: ${error.message}`, { cause: error });
  }
}

function tokenise(text) {
  return text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
}

// Spring AI's TokenTextSplitter is configured with a 300-token chunk size and
// no explicit overlap. This keeps the same page-oriented, bounded-chunk flow.
function splitText(text, chunkSize = 300) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive integer');
  const tokens = tokenise(text.trim());
  if (tokens.length === 0) return [];

  const chunks = [];
  for (let index = 0; index < tokens.length; index += chunkSize) {
    const chunk = tokens.slice(index, index + chunkSize).join(' ').replace(/\s+([,.;:!?])/g, '$1');
    if (chunk.trim()) chunks.push(chunk.trim());
  }
  log('KnowledgeBase', 'Text split into chunks', {
    tokenCount: tokens.length,
    chunkSize,
    chunkCount: chunks.length
  });
  return chunks;
}

async function loadKnowledgeChunks(directory, chunkSize = 300) {
  log('KnowledgeBase', 'Scanning knowledge directory', { directory, chunkSize });
  const entries = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) {
    log('KnowledgeBase', 'No PDF files found', { directory });
    throw new Error(`No PDF knowledge documents found in ${directory}`);
  }

  log('KnowledgeBase', 'Knowledge PDFs discovered', {
    fileCount: entries.length,
    files: entries.map((entry) => entry.name)
  });
  const chunks = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    const pages = await extractPdfPages(filePath);
    log('KnowledgeBase', 'Processing PDF pages', { fileName: entry.name, pageCount: pages.length });
    pages.forEach((pageText, pageIndex) => {
      const pageChunks = splitText(pageText, chunkSize);
      log('KnowledgeBase', 'Page split into chunks', {
        fileName: entry.name,
        page: pageIndex + 1,
        chunkCount: pageChunks.length
      });
      pageChunks.forEach((text, chunkIndex) => {
        chunks.push({
          id: `${entry.name}:page-${pageIndex + 1}:chunk-${chunkIndex + 1}`,
          text,
          metadata: {
            text,
            source: filePath,
            fileName: entry.name,
            page: pageIndex + 1
          }
        });
      });
    });
  }
  log('KnowledgeBase', 'All knowledge chunks prepared', { chunkCount: chunks.length });
  return chunks;
}

module.exports = { extractPdfPages, splitText, loadKnowledgeChunks };
