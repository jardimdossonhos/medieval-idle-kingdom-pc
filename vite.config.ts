import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".mts", ".jsx", ".json"]
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022"
    }
  },
  build: {
    target: "es2022"
  },
  test: {
    // Point Vitest to unit tests inside the `src` folder ONLY.
    include: ["src/**/*.test.ts"]
  }
});
