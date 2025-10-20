import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { convertPdfToSvg, initialize, shutdown } from "../src/index.js";

const samplePdfPath = new URL("../assets/text-operators.pdf", import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("convertPdfToSvg", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await shutdown();
  });

  it("converts a PDF into SVG markup", async () => {
    const pdfBytes = await readFile(samplePdfPath);
    const result = await convertPdfToSvg(pdfBytes);

    expect(result.pages.length).toBeGreaterThan(0);

    for (const page of result.pages) {
      expect(page.svg).toContain("<svg");
      expect(page.svg.trim().endsWith("</svg>"))
        .toBe(true);
    }
  });

  it("filters specific pages when requested", async () => {
    const pdfBytes = await readFile(samplePdfPath);
    const result = await convertPdfToSvg(pdfBytes, { pages: [1] });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(1);
  });

  it("converts all PDFs in assets to SVG files", async () => {
    const testDataDir = new URL("../assets/", import.meta.url);
    await mkdir(join(__dirname, 'output'), { recursive: true });
    const files = await readdir(testDataDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    let successfulConversions = 0;

    for (const pdfFile of pdfFiles) {
      const pdfPath = new URL(`../assets/${pdfFile}`, import.meta.url);
      const pdfBytes = await readFile(pdfPath);
      try {
        const result = await convertPdfToSvg(pdfBytes);

        expect(result.pages.length).toBeGreaterThan(0);
        successfulConversions++;

        // Write each page as a separate SVG file
        for (let i = 0; i < result.pages.length; i++) {
          const svgFileName = pdfFile.replace('.pdf', `_page${i + 1}.svg`);
          const outputPath = join(__dirname, 'output', svgFileName);
          await writeFile(outputPath, result.pages[i].svg);
        }
      } catch (error) {
        // Skip PDFs that fail due to unsupported crypto (e.g., MD5)
        if (error instanceof Error && error.message.includes('Cryptography_UnknownHashAlgorithm')) {
          console.warn(`Skipping ${pdfFile} due to unsupported hash algorithm`);
        } else {
          throw error;
        }
      }
    }

    expect(successfulConversions).toBeGreaterThan(0);
  }, 30000);
});
