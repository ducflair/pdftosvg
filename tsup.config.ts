import { defineConfig } from "tsup";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  splitting: false,
  minify: false,
  external: [],
  banner: {
    js: `// Runtime files will be resolved from the dist directory`
  },
  loader: {
    ".json": "json"
  },
  onSuccess: async () => {
    // Copy runtime directory to dist after build
    const runtimeDir = join(process.cwd(), "runtime");
    const distRuntimeDir = join(process.cwd(), "dist", "runtime");

    if (existsSync(runtimeDir)) {
      if (!existsSync(distRuntimeDir)) {
        mkdirSync(distRuntimeDir, { recursive: true });
      }

      // Copy runtime files
      const fs = await import("fs/promises");
      const path = await import("path");

      async function copyDir(src: string, dest: string) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });

        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);

          if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      }

      await copyDir(runtimeDir, distRuntimeDir);
      console.log("✓ Runtime files copied to dist/runtime");
    }
  }
});
