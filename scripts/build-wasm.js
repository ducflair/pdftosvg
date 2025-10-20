#!/usr/bin/env node

import { cp, mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");
const templateRoot = join(packageRoot, "dotnet");
const runtimeOutput = join(packageRoot, "runtime");

const DEFAULT_REPO = "https://github.com/dmester/pdftosvg.net.git";

const repoUrl = process.env.PDFTOSVG_REPO ?? DEFAULT_REPO;
const repoRef = process.env.PDFTOSVG_REF;
const localSourceOverride = process.env.PDFTOSVG_SOURCE;
const skipWorkloadInstall = process.env.PDFTOSVG_SKIP_WORKLOAD === "1";
const keepTemp = process.env.PDFTOSVG_KEEP_TEMP === "1";

function log(message) {
  console.log(`\u001b[36m[build-wasm]\u001b[0m ${message}`);
}

const execFileAsync = promisify(execFile);

function exec(cmd, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(cmd, args, {
      stdio: "inherit",
      ...options,
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });

    child.once("error", rejectPromise);
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasWasmWorkload() {
  try {
    const { stdout } = await execFileAsync("dotnet", ["workload", "list", "--machine-readable"], {
      encoding: "utf8",
    });

  const jsonStart = stdout.indexOf("{");
  const jsonPayload = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
  const payload = JSON.parse(jsonPayload);
    const installed = payload?.installed ?? [];
    return installed.some((entry) => {
      if (!entry) return false;
      if (typeof entry === "string") {
        return entry === "wasm-tools";
      }
      return entry?.workloadId === "wasm-tools";
    });
  } catch {
    return false;
  }
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "pdftosvg-build-"));
  const repoDir = join(tempRoot, "pdftosvg.net");
  const projectDir = join(tempRoot, "PdfToSvgWasm");
  const publishDir = join(tempRoot, "publish");

  log(`Using temporary workspace: ${tempRoot}`);

  try {
    log("Preparing C# shim project");
    await cp(templateRoot, projectDir, { recursive: true });

    if (localSourceOverride) {
      log(`Copying PdfToSvg.NET from local path: ${localSourceOverride}`);
      await cp(resolve(localSourceOverride), repoDir, { recursive: true });
    } else {
      const cloneArgs = ["clone", "--depth", "1", repoUrl, repoDir];
      if (repoRef) {
        cloneArgs.splice(3, 0, "--branch", repoRef);
      }

      log(`Cloning PdfToSvg.NET repository (${repoUrl}${repoRef ? `#${repoRef}` : ""})`);
      await exec("git", cloneArgs);
    }

    if (!skipWorkloadInstall) {
      const alreadyInstalled = await hasWasmWorkload();
      if (alreadyInstalled) {
        log("wasm-tools workload already installed");
      } else {
        log("Installing wasm-tools workload");
        await exec("dotnet", ["workload", "install", "wasm-tools"]);
      }
    } else {
      log("Skipping wasm-tools workload install (PDFTOSVG_SKIP_WORKLOAD=1)");
    }

    log("Publishing WebAssembly build");
    const publishArgs = [
      "publish",
      projectDir,
      "-c",
      "Release",
      "-o",
      publishDir,
      "--nologo",
      "/p:TargetOS=Browser",
      "/p:TargetArchitecture=wasm"
    ];
    await exec("dotnet", publishArgs);

    const appBundleCandidates = [
      join(publishDir, "wwwroot"),
      join(publishDir, "AppBundle"),
      join(projectDir, "bin", "Release", "net9.0", "browser-wasm", "AppBundle"),
    ];

    let assetSource = null;
    for (const candidate of appBundleCandidates) {
      if (await pathExists(candidate)) {
        assetSource = candidate;
        break;
      }
    }

    if (!assetSource) {
      throw new Error("Failed to locate WebAssembly output (looked for wwwroot/AppBundle)");
    }

    log(`Updating runtime assets in ${runtimeOutput}`);
    await rm(runtimeOutput, { recursive: true, force: true });
    await mkdir(runtimeOutput, { recursive: true });
    await cp(assetSource, runtimeOutput, { recursive: true });

    const runtimeConfigPath = join(publishDir, "PdfToSvgWasm.runtimeconfig.json");
    if (await pathExists(runtimeConfigPath)) {
      await cp(runtimeConfigPath, join(runtimeOutput, "PdfToSvgWasm.runtimeconfig.json"));
    }

    log("WebAssembly runtime refreshed successfully");
  } finally {
    if (!keepTemp) {
      await rm(tempRoot, { recursive: true, force: true });
    } else {
      log(`Keeping temporary workspace at ${tempRoot}`);
    }
  }
}

main().catch((error) => {
  console.error("\u001b[31m[build-wasm] Build failed:\u001b[0m", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
