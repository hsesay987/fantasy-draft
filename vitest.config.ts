import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", include: ["app/**/*.test.ts", "backend/src/**/*.test.ts"], exclude: ["backend/src/shared/**", "node_modules/**"] },
});
