import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/app.ts"],
  publicDir: false,
  clean: true,
  minify: true,
  format: ["cjs", "esm"] // 👈 Node
});
