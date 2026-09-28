// Failure plan: old saved/custom models remain visible; RPC writes bypass the picker;
// resumed chats and quick tasks retain another provider; invalid policy falls back silently.
// Real User Durable Object RPC and persisted SQLite state, using only synthetic local bindings.
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("restricts employee model discovery, settings and resumed chat resolution", async () => {
  const user = exports.UserDurableObject.get(exports.UserDurableObject.newUniqueId());
  const models = await user.listModels();
  expect(models.map(model => model.id)).toEqual(["gpt-6-luna"]);
  await expect(user.addModel({ type: "agent", id: "custom", name: "Custom" }, {
    provider: "anthropic", model: "claude-sonnet-4-5", apiToken: "fixture",
  })).rejects.toThrow(/managed/);
  await expect(user.setPreferredModel("gpt-5.6-sol")).rejects.toThrow(/managed/);
  await expect(user.setQuickModel("gpt-5.6-sol")).rejects.toThrow(/managed/);
  expect(await user.getPreferredModel()).toBe("gpt-6-luna");
  expect(await user.getQuickModel()).toBe("gpt-6-luna");
  // Null is still needed for non-inference operations; it must not start an agent.
  expect((await user.getChatContext(null)).aiModel).toBeUndefined();
  for (const previous of ["gpt-5.6-luna", "gpt-5.6-sol", "custom"]) {
    const context = await user.getChatContext(previous);
    expect(context.aiModel?.config.model).toBe("gpt-6-luna");
    expect(context.quickModel?.model).toBe("gpt-6-luna");
  }
});
