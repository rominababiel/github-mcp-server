import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    env: { LOG_LEVEL: "silent", GITHUB_TOKEN: "" },
  },
});
