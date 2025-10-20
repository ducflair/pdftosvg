// Check if we're running from source (development) or from dist (production)
const isDev = import.meta.url.includes('/src/') || import.meta.url.includes('\\src\\');
const runtimePath = isDev ? "../runtime/" : "./runtime/";
const runtimeRootUrl = new URL(runtimePath, import.meta.url);
const frameworkRootUrl = new URL("./_framework/", runtimeRootUrl);
const dotnetModuleUrl = new URL("./dotnet.js", frameworkRootUrl);
const bootConfigUrl = new URL("./blazor.boot.json", frameworkRootUrl);

export type PdfInput = ArrayBuffer | ArrayBufferView | Uint8Array | Blob;

export type FontStrategy = "auto" | "woff" | "opentype" | "local";

export interface PdfToSvgOptions {
  password?: string;
  includeAnnotations?: boolean;
  includeHiddenText?: boolean;
  includeLinks?: boolean;
  collapseSpaceEmbeddedFont?: number;
  collapseSpaceLocalFont?: number;
  minStrokeWidth?: number;
  fontStrategy?: FontStrategy;
  pages?: number[];
}

export interface SvgPage {
  pageIndex: number;
  pageNumber: number;
  svg: string;
}

export interface PdfToSvgResult {
  pages: SvgPage[];
}

type DotnetCreateRuntime = (options: {
  configSrc: string;
}) => Promise<RuntimeApi>;

type AssemblyExports = Record<string, any>;

type RuntimeApi = {
  getAssemblyExports(assemblyName: string): Promise<AssemblyExports>;
  dispose?: () => void;
};

interface RuntimeContext {
  runtime: RuntimeApi;
  convert: (data: Uint8Array, options?: string | null) => string[];
}

interface InteropOptions {
  password?: string;
  includeAnnotations?: boolean;
  includeHiddenText?: boolean;
  includeLinks?: boolean;
  collapseSpaceEmbeddedFont?: number;
  collapseSpaceLocalFont?: number;
  minStrokeWidth?: number;
  fontStrategy?: "woff" | "opentype" | "local";
  pages?: number[];
}

interface ParsedOptions {
  interop?: InteropOptions;
  requestedIndices: number[] | null;
}

let runtimeContextPromise: Promise<RuntimeContext> | null = null;

async function loadRuntime(): Promise<RuntimeContext> {
  if (!runtimeContextPromise) {
    runtimeContextPromise = (async () => {
      const dotnetModule = await import(dotnetModuleUrl.href);
      const createRuntime: DotnetCreateRuntime = dotnetModule.createDotnetRuntime ?? dotnetModule.default;
      if (typeof createRuntime !== "function") {
        throw new Error("Failed to load .NET WebAssembly runtime entry point.");
      }

      const runtime = await createRuntime({
        configSrc: bootConfigUrl.href
      });

      const assemblyExports = await runtime.getAssemblyExports("PdfToSvgWasm.dll");
      const namespaceExports = assemblyExports?.PdfToSvgWasm?.PdfToSvgExports;

      if (!namespaceExports || typeof namespaceExports.ConvertPdfToSvg !== "function") {
        throw new Error("PdfToSvgWasm exports are unavailable.");
      }

      const convert = namespaceExports.ConvertPdfToSvg as (data: Uint8Array, options?: string | null) => string[];

      return { runtime, convert };
    })();
  }

  return runtimeContextPromise;
}

function normalizeFontStrategy(value?: FontStrategy): "woff" | "opentype" | "local" | undefined {
  if (!value || value === "auto") {
    return undefined;
  }

  if (value === "woff" || value === "opentype" || value === "local") {
    return value;
  }

  throw new RangeError(`Unsupported font strategy: ${value}`);
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function parseOptions(options?: PdfToSvgOptions): ParsedOptions {
  if (!options) {
    return { interop: undefined, requestedIndices: null };
  }

  const interop: InteropOptions = {};

  if (options.password != null) {
    interop.password = options.password;
  }

  if (options.includeAnnotations != null) {
    interop.includeAnnotations = options.includeAnnotations;
  }

  if (options.includeHiddenText != null) {
    interop.includeHiddenText = options.includeHiddenText;
  }

  if (options.includeLinks != null) {
    interop.includeLinks = options.includeLinks;
  }

  if (options.collapseSpaceEmbeddedFont != null) {
    validateFinite("collapseSpaceEmbeddedFont", options.collapseSpaceEmbeddedFont);
    interop.collapseSpaceEmbeddedFont = options.collapseSpaceEmbeddedFont;
  }

  if (options.collapseSpaceLocalFont != null) {
    validateFinite("collapseSpaceLocalFont", options.collapseSpaceLocalFont);
    interop.collapseSpaceLocalFont = options.collapseSpaceLocalFont;
  }

  if (options.minStrokeWidth != null) {
    validateFinite("minStrokeWidth", options.minStrokeWidth);
    interop.minStrokeWidth = options.minStrokeWidth;
  }

  const normalizedFontStrategy = normalizeFontStrategy(options.fontStrategy);
  if (normalizedFontStrategy) {
    interop.fontStrategy = normalizedFontStrategy;
  }

  let requestedIndices: number[] | null = null;

  if (options.pages && options.pages.length > 0) {
    requestedIndices = options.pages.map((page, index) => {
      if (!Number.isInteger(page) || page <= 0) {
        throw new RangeError(`Page numbers must be positive integers. Received ${page} at position ${index}.`);
      }

      return page - 1;
    });

    interop.pages = requestedIndices;
  }

  return {
    interop: Object.keys(interop).length > 0 ? interop : undefined,
    requestedIndices
  };
}

async function toUint8Array(input: PdfInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const buffer = await input.arrayBuffer();
    return new Uint8Array(buffer);
  }

  throw new TypeError("Unsupported PDF input type.");
}

function mapResultPages(svgFragments: string[], requestedIndices: number[] | null): SvgPage[] {
  const pageIndices = (() => {
    if (requestedIndices) {
      if (requestedIndices.length !== svgFragments.length) {
        throw new Error("Mismatch between requested page indices and generated SVG results.");
      }

      return requestedIndices;
    }

    return svgFragments.map((_, index) => index);
  })();

  return svgFragments.map((svg, index) => ({
    pageIndex: pageIndices[index],
    pageNumber: pageIndices[index] + 1,
    svg
  }));
}

export async function initialize(): Promise<void> {
  await loadRuntime();
}

export async function convertPdfToSvg(input: PdfInput, options?: PdfToSvgOptions): Promise<PdfToSvgResult> {
  const data = await toUint8Array(input);
  const { interop, requestedIndices } = parseOptions(options);
  const optionsJson = interop ? JSON.stringify(interop) : undefined;
  const { convert } = await loadRuntime();

  const svgFragments = convert(data, optionsJson ?? null);
  return {
    pages: mapResultPages(svgFragments, requestedIndices)
  };
}

export async function shutdown(): Promise<void> {
  if (!runtimeContextPromise) {
    return;
  }

  const context = await runtimeContextPromise;
  if (typeof context.runtime.dispose === "function") {
    context.runtime.dispose();
  }
  runtimeContextPromise = null;
}
