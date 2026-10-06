import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import capnwebValidate from "capnweb-validate/vite";
import { defineConfig } from "vitest/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const artifactDirectory = new URL("../../output/e2e/gadget-creation-disabled/", import.meta.url);
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(new URL("fixture.json", artifactDirectory), JSON.stringify({
  username: "creationdisabledfixture",
  runtime: "local workerd with authenticated WebSocket RPC and SQLite Durable Objects",
  policy: { GADGET_CREATION_ENABLED: "false" },
  inference: "synthetic response; production provider and source integrations are not exercised",
  reproducer: "pnpm --filter @gadgets/workshop-backend test:creation-disabled",
}, null, 2) + "\n");

export default defineConfig({
  esbuild: { target: "es2022" },
  plugins: [capnwebValidate(), cloudflareTest({
    main: "./src/server.ts",
    remoteBindings: false,
    miniflare: { bindings: {
      GADGET_CREATION_ENABLED: "false",
      CF_AI_GATEWAY: "fixture-gateway", CF_AI_GATEWAY_ACCOUNT_ID: "fixture-account",
      CF_AI_GATEWAY_API_TOKEN: "fixture-token", CF_AI_GATEWAY_PROVIDERS: "openai",
      CF_AI_GATEWAY_FIXED_MODEL: "gpt-6-luna",
    } },
    wrangler: { configPath: "./wrangler.jsonc" },
  })],
  test: {
    reporters: ["default", "json"],
    outputFile: fileURLToPath(new URL("result.json", artifactDirectory)),
    include: ["__e2e__/gadget-creation-disabled.test.ts"],
    setupFiles: ["../../scripts/assert-workerd.ts"],
    testTimeout: 60_000,
    // Rejected future capabilities also report their rejection independently of pipelined calls.
    onUnhandledError(error) {
      if (error.message === "Gadget creation is temporarily disabled.") return false;
    },
  },
});
