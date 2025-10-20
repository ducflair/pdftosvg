import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Import the built version for CI testing
import { convertPdfToSvg, initialize, shutdown } from "../dist/index.js";

const samplePdfPath = new URL("../assets/text-operators.pdf", import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("convertPdfToSvg (Built Version)", () => {
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

  it("converts a simple PDF to SVG", async () => {
    // Test with a simpler PDF that should work in CI
    const testPdfPath = new URL("../assets/test.pdf", import.meta.url);

    try {
      const pdfBytes = await readFile(testPdfPath);
      const result = await convertPdfToSvg(pdfBytes);

      expect(result.pages.length).toBeGreaterThan(0);

      for (const page of result.pages) {
        expect(page.svg).toContain("<svg");
        expect(page.svg.length).toBeGreaterThan(100);
      }
    } catch (error) {
      // If test.pdf doesn't exist, skip this test
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.log("test.pdf not found, skipping this test");
        return;
      }
      throw error;
    }
  }, 45000);
});