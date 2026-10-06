// Failure plan: hiding a tool leaves browser RPC/blueprints open; a denied request spends tokens
// or leaves a draft; disabling creation breaks ordinary chats or migration of existing gadgets.
// Real authenticated WebSocket RPC, Overseer/User DOs, and local SQLite. No production data.
import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { newWebSocketRpcSession, type RpcStub } from "capnweb";
import type { PublicApi } from "@gadgets/workshop-shared/api";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { expect, it, vi } from "vitest";

const DISABLED = "Gadget creation is temporarily disabled.";
const requests = vi.hoisted(() => [] as { tools: string[]; prompt: string }[]);
// Only inference is substituted; the real agent assembles its prompt/tools and persists its reply.
vi.mock("../src/ai-models", async importOriginal => {
  const original = await importOriginal<typeof import("../src/ai-models")>();
  return { ...original, getModel(...args: Parameters<typeof original.getModel>)
      : ReturnType<typeof original.getModel> {
    const handle = original.getModel(...args);
    return { ...handle, stream(model, context) {
      requests.push({ tools: context.tools?.map(tool => tool.name) ?? [],
        prompt: context.systemPrompt ?? "" });
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", content: [{ type: "text", text: "Fixture lead trend summary." }],
        api: model.api, provider: model.provider, model: model.id,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop", timestamp: Date.now(),
      };
      queueMicrotask(() => { stream.push({ type: "done", reason: "stop", message }); stream.end(); });
      return stream;
    } };
  } };
});

async function connect(): Promise<RpcStub<PublicApi>> {
  const response = await exports.default.fetch(new Request("https://workshop.invalid/api", {
    headers: { Upgrade: "websocket" },
  }));
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error("Expected WebSocket.");
  response.webSocket.accept();
  return newWebSocketRpcSession<PublicApi>(response.webSocket);
}

it("blocks direct and blueprint creation before side effects while chat remains available", async () => {
  using publicApi = await connect();
  const username = "creationdisabledfixture";
  const token = await publicApi.createAccount(username, username, new Uint8Array([1, 2, 3]));
  if (!token) throw new Error("Fixture account was not created.");
  using authenticated = await publicApi.authenticate(token);
  using workspace = await authenticated.newGadget();
  const metadata = await workspace.getMetadata();
  const doStub = exports.OverseerDurableObject.get(
    exports.OverseerDurableObject.idFromString(metadata.id));
  const chatId = await workspace.newChat("Show the lead trend in this conversation.", null);
  expect(await workspace.listChats()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: chatId }),
  ]));
  expect(await authenticated.listOutputFormats()).toEqual([]);

  // Omitted binding name normally invokes the quick model. A denied request must not do so.
  const outbound = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("Denied gadget creation must not call a provider.");
  });
  try {
    using creation = workspace.createGadget("Lead Trends", chatId);
    await expect(creation.getTitle()).rejects.toThrow(DISABLED);
    using namedCreation = workspace.createGadget("Lead Trends", undefined, "LEAD_TRENDS");
    await expect(namedCreation.getTitle()).rejects.toThrow(DISABLED);
    using blueprint = authenticated.newGadgetFromBlueprint("missing-fixture-blueprint", {});
    await expect(blueprint.getMetadata()).rejects.toThrow(DISABLED);
    // The DO boundary is also protected before title/code/default-gadget mutations.
    await expect(doStub.initializeFromBlueprint(new Uint8Array(), "Denied title"))
      .rejects.toThrow(DISABLED);
    expect(outbound).not.toHaveBeenCalled();
  } finally {
    outbound.mockRestore();
  }
  expect((await workspace.getMetadata()).title).not.toBe("Denied title");
  expect(await authenticated.listGadgets()).toHaveLength(1);
  expect(await runInDurableObject(doStub, async (_instance, state) =>
    (await state.storage.list({ prefix: "gadgets:" })).size)).toBe(0);
  expect((await workspace.getChatHistory(chatId)).messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "message", message: "Show the lead trend in this conversation." }),
  ]));

  // Exercise an actual agent turn through the same authenticated capability.
  await workspace.sendChatMessage(chatId, "Explain the lead trend here.", "gpt-6-luna");
  await vi.waitFor(async () => {
    const history = await workspace.getChatHistory(chatId);
    expect(history.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message", message: "Fixture lead trend summary." }),
    ]));
  }, { timeout: 15_000 });
  const agentRequest = requests.find(request => request.tools.includes("executeCode"));
  expect(agentRequest).toBeDefined();
  expect(agentRequest!.tools).not.toContain("createGadget");
  expect(agentRequest!.tools).not.toContain("listBlueprints");
  expect(agentRequest!.prompt).not.toContain("Before writing any code, create");
  expect(agentRequest!.prompt).not.toContain("Any of those is a request for a new Gadget");
  expect(agentRequest!.prompt).toContain("Gadget creation is temporarily disabled");

  // Seed a synthetic pre-existing registry entry; the kill switch must preserve read access.
  await runInDurableObject(doStub, (_instance, state) => state.storage.put("gadgets:a1", {
    id: 1, title: "Existing fixture", created: new Date(), bindingName: "EXISTING", bindings: {},
  }));
  using existing = workspace.getGadget(1);
  expect(await existing.getTitle()).toBe("Existing fixture");
});
