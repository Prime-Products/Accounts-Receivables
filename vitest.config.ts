import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      // Pure helper modules shared by the UI (formatting, timeline building, filters).
      "client/src/lib/**/*.test.ts",
      // Contracts shared by client and server (mention markup, text matching).
      "shared/**/*.test.ts",
    ],
    fileParallelism: false,
    /**
     * Almost every suite talks to the remote TiDB instance, where a single
     * round-trip can take a few hundred ms. The 5s default made DB-backed tests
     * flake when the whole suite runs back to back; 30s is still short enough to
     * catch a genuine hang.
     */
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
