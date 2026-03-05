import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".mts", ".jsx", ".json"]
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
