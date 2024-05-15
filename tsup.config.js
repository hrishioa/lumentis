import { defineConfig } from "tsup";

export default defineConfig({
    entry: [
        "src/app.ts",
        "src/folder-importing/worker-clean-dirtree.ts",
        "src/folder-importing/worker-dirtree.ts",
        "src/folder-importing/worker-flatten-tree-for-checkbox.ts",
        "src/folder-importing/worker-remove-deselected.ts",
    ],
    outDir: "dist",
    publicDir: false,
    clean: true,
    minify: true,
    format: ["cjs", "esm"], // 👈 Node
});
