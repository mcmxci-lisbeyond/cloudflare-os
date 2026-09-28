// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { newMessagePortRpcSession, RpcStub, RpcTarget } from "capnweb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatekeeperUiFrame } from "@gadgets/workshop-shared/gatekeeper";
import type {
  GatekeeperAppTheme,
  GatekeeperAppThemeReceiver,
  GatekeeperChatModelState,
} from "@gadgets/workshop-shared/theme";
import SandboxedGatekeeperApp from "./SandboxedGatekeeperApp";
import { parsePropertyRouteState } from "./gatekeeperAppNavigation";
import {
  RailConnectionsProvider,
  useRailConnections,
} from "./components/AppShell/railConnectionsContext";

vi.mock("./ThemeContext", () => ({
  useTheme: () => ({ resolvedThemeMode: "light" }),
}));

vi.mock("./ServerConfigContext", () => ({
  useServerConfig: () => ({ accentColor: "#7c3aed" }),
}));

vi.mock("./errorReporting", () => ({
  forwardTrustedFrameError: () => false,
}));

const WORKSPACE_ID = "a".repeat(64);

const listGadgets = vi.fn<() => Promise<{ id: string; title: string }[]>>(async () => [
  { id: WORKSPACE_ID, title: "Daily Brief" },
]);
const listModels = vi.fn<() => Promise<Array<{ type: "agent"; id: string; name: string }>>>(async () => [
  { type: "agent" as const, id: "gpt-6-luna", name: "GPT-6 Luna" },
  { type: "agent" as const, id: "model-b", name: "Model B" },
]);
const authenticatedApi = { listGadgets, listModels };

const storage = new Map<string, string>();
const localStorageStub = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
};

vi.mock("./AuthContext", () => ({
  useAuthenticatedApi: () => ({ authenticatedApi }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TestHost extends RpcTarget {
  subscribeTheme(receiver: GatekeeperAppThemeReceiver): Promise<GatekeeperAppTheme>;
  openWorkspace(workspaceId: string, gadgetId?: number): Promise<void>;
  resolveWorkspaceTitles(ids: string[]): Promise<(string | null)[]>;
  openPrompt(prompt: string): Promise<void>;
  getAppRoute(): Promise<string | null>;
  getWorkflowRouteState(): Promise<Record<string, string>>;
  setWorkflowRouteState(state: unknown): Promise<void>;
  getPropertyRouteState(): Promise<Record<string, unknown>>;
  setPropertyRouteState(state: unknown, mode: unknown): Promise<void>;
  openAppRoute(route: string): Promise<void>;
  openPropertyGuide(pNumber: unknown): Promise<void>;
  openGuideSource(url: unknown): Promise<void>;
  reportConnections(rows: unknown): Promise<void>;
  getChatModelState(): Promise<GatekeeperChatModelState>;
  setChatModel(modelId: string | null): Promise<GatekeeperChatModelState>;
}

class EmptyUi extends RpcTarget {}

class TestThemeReceiver extends RpcTarget implements GatekeeperAppThemeReceiver {
  setTheme(_theme: GatekeeperAppTheme): void {}
}

function ConnectionsProbe() {
  const { rows } = useRailConnections();
  return <output data-testid="connections-report">{JSON.stringify(rows)}</output>;
}

describe("SandboxedGatekeeperApp navigation", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;
  let host: RpcStub<TestHost> | undefined;

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageStub,
    });
    listGadgets.mockClear();
    listModels.mockClear();
    window.localStorage.clear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(async () => {
    host?.[Symbol.dispose]();
    await act(async () => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("opens exact guide sources and acknowledges cross-page guide navigation before teardown", async () => {
    const external = vi.spyOn(window, "open").mockReturnValue(null);
    const frame = { iframeHtml: "<!doctype html><title>Onboarding</title>", ui: new RpcStub(new EmptyUi()) } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({ component: Outlet });
    const workflows = createRoute({ getParentRoute: () => rootRoute, path: "/workflows", component: () => <RailConnectionsProvider><SandboxedGatekeeperApp frame={frame} gatekeeperVendorId="lisbeyond" appRoute="workflows" /></RailConnectionsProvider> });
    const properties = createRoute({ getParentRoute: () => rootRoute, path: "/properties", validateSearch: parsePropertyRouteState, component: () => <p>Property guide</p> });
    const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/workflows?workflow=property-onboarding"] }), routeTree: rootRoute.addChildren([workflows, properties]) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));
    const iframe = container.querySelector("iframe")!;
    const { port1, port2 } = new MessageChannel(); host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: iframe.contentWindow, ports: [port2] }));
    await host.openGuideSource("https://www.notion.so/fixture-revision");
    expect(external).toHaveBeenCalledWith("https://www.notion.so/fixture-revision", "_blank", "noopener,noreferrer");
    await expect(host.openGuideSource("https://evil.test")).rejects.toThrow("Invalid guide source link");
    expect(external).toHaveBeenCalledTimes(1);
    await expect(host.openPropertyGuide("P9004&tab=activity")).rejects.toThrow("Invalid property guide target");
    await act(async () => {
      await host!.openPropertyGuide("P9004");
      await vi.waitFor(() => expect(router.state.location.pathname).toBe("/properties"));
    });
    expect(router.state.location.search).toEqual({ property: "P9004", tab: "guide" });
    expect(container.querySelector("iframe")).toBeNull();
    await act(async () => router.history.back());
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/workflows"));
    expect(router.state.location.search).toEqual({ workflow: "property-onboarding" });
  });

  it("does not grant guide destinations to another gatekeeper", async () => {
    const external = vi.spyOn(window, "open").mockReturnValue(null);
    const frame = { iframeHtml: "<!doctype html><title>Other app</title>", ui: new RpcStub(new EmptyUi()) } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({ component: () => <RailConnectionsProvider><SandboxedGatekeeperApp frame={frame} gatekeeperVendorId="other" appRoute="workflows" /></RailConnectionsProvider> });
    const workflows = createRoute({ getParentRoute: () => rootRoute, path: "/workflows" });
    const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/workflows"] }), routeTree: rootRoute.addChildren([workflows]) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));
    const iframe = container.querySelector("iframe")!;
    const { port1, port2 } = new MessageChannel(); host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: iframe.contentWindow, ports: [port2] }));
    await expect(host.openPropertyGuide("P9004")).rejects.toThrow("Guide navigation is unavailable");
    await expect(host.openGuideSource("https://www.notion.so/fixture")).rejects.toThrow("Guide navigation is unavailable");
    expect(external).not.toHaveBeenCalled();
  });

  it("reads and updates bounded workflow URL state over the real host RPC", async () => {
    const frame = { iframeHtml: "<!doctype html><title>Invoices</title>", ui: new RpcStub(new EmptyUi()) } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({ component: () => <RailConnectionsProvider><SandboxedGatekeeperApp frame={frame} gatekeeperVendorId="lisbeyond" appRoute="workflows" /></RailConnectionsProvider> });
    const workflows = createRoute({ getParentRoute: () => rootRoute, path: "/workflows" });
    const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/workflows?workflow=renovations-invoice-intake&tab=invoices&status=awaiting_approval&item=fixture-1"] }), routeTree: rootRoute.addChildren([workflows]) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-modals allow-downloads");
    const { port1, port2 } = new MessageChannel(); host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: iframe.contentWindow, ports: [port2] }));
    await expect(host.getWorkflowRouteState()).resolves.toEqual({ workflow: "renovations-invoice-intake", tab: "invoices", status: "awaiting_approval", item: "fixture-1" });
    await act(async () => { await host!.setWorkflowRouteState({ workflow: "renovations-invoice-intake", tab: "activity", external: "https://evil.example" }); await vi.waitFor(() => expect(router.state.location.search).toEqual({ workflow: "renovations-invoice-intake", tab: "activity" })); });
    await expect(host.getWorkflowRouteState()).resolves.toEqual({ workflow: "renovations-invoice-intake", tab: "activity" });
    expect(router.state.location.pathname).toBe("/workflows");
  });

  it.each(["guide", "feedback", "reviews"])("pushes property %s after saving list state without remounting on browser Back", async tab => {
    const frame = { iframeHtml: "<!doctype html><title>Properties</title>", ui: new RpcStub(new EmptyUi()) } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({ component: () => <RailConnectionsProvider><SandboxedGatekeeperApp frame={frame} gatekeeperVendorId="lisbeyond" appRoute="properties" /></RailConnectionsProvider> });
    const properties = createRoute({ getParentRoute: () => rootRoute, path: "/properties", validateSearch: parsePropertyRouteState });
    const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/properties?q=river&region=Lisbon&scroll=620"] }), routeTree: rootRoute.addChildren([properties]) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));
    const initialIframe = container.querySelector("iframe")!;
    const { port1, port2 } = new MessageChannel(); host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: initialIframe.contentWindow, ports: [port2] }));
    await expect(host.getPropertyRouteState()).resolves.toEqual({ q: "river", region: "Lisbon", scroll: 620 });

    await host.setPropertyRouteState({ property: "p0478", tab, q: "river", region: "Lisbon", scroll: 620 }, "push");
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ property: "P0478", tab, q: "river", region: "Lisbon", scroll: 620 }));
    const detailIframe = container.querySelector("iframe")!;
    expect(detailIframe).toBe(initialIframe);

    await act(async () => router.history.back());
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ q: "river", region: "Lisbon", scroll: 620 }));
    expect(container.querySelector("iframe")).toBe(detailIframe);
  });

  it("provides the deployment theme and routes bounded iframe requests", async () => {
    const frame = {
      iframeHtml: "<!doctype html><title>Scheduler</title>",
      ui: new RpcStub(new EmptyUi()),
    } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({
      component: () => (
        <RailConnectionsProvider>
          <SandboxedGatekeeperApp
            frame={frame}
            gatekeeperVendorId="lisbeyond"
            appRoute="properties"
          />
          <ConnectionsProbe />
        </RailConnectionsProvider>
      ),
    });
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
    const gadgetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/workspace/$id",
    });
    const askBifanaRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/ask-bifana",
    });
    const connectionsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/connections",
    });
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createRouter({
      history,
      routeTree: rootRoute.addChildren([
        indexRoute,
        gadgetRoute,
        askBifanaRoute,
        connectionsRoute,
      ]),
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));

    const iframe = container.querySelector("iframe");
    if (!iframe) throw new Error("Missing gatekeeper iframe");
    const { port1, port2 } = new MessageChannel();
    host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "handshake" },
        origin: "null",
        source: iframe.contentWindow,
        ports: [port2],
      }),
    );

    const themeReceiver = new TestThemeReceiver();
    await expect(host.subscribeTheme(themeReceiver)).resolves.toEqual({
      mode: "light",
      accentColor: "#7c3aed",
      features: { connections: true },
    });
    await expect(host.getChatModelState()).rejects.toThrow(
      "Chat model selection is unavailable for this app.",
    );
    await expect(host.setChatModel("gpt-6-luna")).rejects.toThrow(
      "Chat model selection is unavailable for this app.",
    );
    expect(listModels).not.toHaveBeenCalled();
    await expect(host.getAppRoute()).resolves.toBe("properties");
    await expect(host.getWorkflowRouteState()).resolves.toEqual({});
    await expect(host.setWorkflowRouteState({ item: "item-1" })).rejects.toThrow("Workflow navigation is unavailable here.");

    await act(async () => {
      await host!.reportConnections([
        { id: "hostaway", name: "Hostaway", state: "live", detail: "Live" },
      ]);
    });
    expect(container.querySelector('[data-testid="connections-report"]')?.textContent).toContain(
      '"id":"hostaway"',
    );

    await act(async () => {
      await host!.openWorkspace(WORKSPACE_ID, 2);
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe(`/workspace/${WORKSPACE_ID}`),
      );
    });
    expect(router.state.location.search).toEqual({ w: 2 });

    // Live titles come from the user's own gadget list, never from the app's snapshot. Concurrent
    // and repeated frame requests share a bounded-lifetime host-side index.
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    listGadgets
      .mockResolvedValueOnce([{ id: WORKSPACE_ID, title: "Daily Brief" }])
      .mockResolvedValueOnce([{ id: WORKSPACE_ID, title: "Renamed Brief" }]);
    await expect(
      Promise.all([
        host.resolveWorkspaceTitles([WORKSPACE_ID, "b".repeat(64)]),
        host.resolveWorkspaceTitles([WORKSPACE_ID]),
      ]),
    ).resolves.toEqual([["Daily Brief", null], ["Daily Brief"]]);
    await expect(host.resolveWorkspaceTitles([WORKSPACE_ID])).resolves.toEqual(["Daily Brief"]);
    expect(listGadgets).toHaveBeenCalledTimes(1);

    now.mockReturnValue(30_000);
    await expect(host.resolveWorkspaceTitles([WORKSPACE_ID])).resolves.toEqual(["Renamed Brief"]);
    expect(listGadgets).toHaveBeenCalledTimes(2);

    await expect(host.openWorkspace("../evil")).rejects.toThrow(
      "Invalid gatekeeper app workspace target",
    );
    expect(router.state.location.pathname).toBe(`/workspace/${WORKSPACE_ID}`);

    await act(async () => {
      await host!.openAppRoute("connections");
      await vi.waitFor(() => expect(router.state.location.pathname).toBe("/connections"));
    });
    await expect(host.openAppRoute("../admin")).rejects.toThrow(
      "Invalid gatekeeper app route",
    );

    await act(async () => {
      await host!.openPrompt("  Create a daily brief.  ");
      await vi.waitFor(() => expect(router.state.location.pathname).toBe("/ask-bifana"));
    });
    expect(router.state.location.search).toEqual({ prompt: "Create a daily brief." });
  });

  it("acknowledges a Home prompt before production route teardown closes the bridge", async () => {
    const frame = {
      iframeHtml: "<!doctype html><title>Lisbeyond Home</title>",
      ui: new RpcStub(new EmptyUi()),
    } as unknown as GatekeeperUiFrame;
    const rootRoute = createRootRoute({ component: Outlet });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => (
        <RailConnectionsProvider>
          <SandboxedGatekeeperApp
            frame={frame}
            gatekeeperVendorId="lisbeyond"
            appRoute="home"
          />
        </RailConnectionsProvider>
      ),
    });
    const askBifanaRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/ask-bifana",
      component: () => <p>Ask Bifana</p>,
    });
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createRouter({
      history,
      routeTree: rootRoute.addChildren([indexRoute, askBifanaRoute]),
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<RouterProvider router={router} />));

    const iframe = container.querySelector("iframe");
    if (!iframe) throw new Error("Missing gatekeeper iframe");
    const { port1, port2 } = new MessageChannel();
    host = newMessagePortRpcSession<TestHost>(port1);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "handshake" },
        origin: "null",
        source: iframe.contentWindow,
        ports: [port2],
      }),
    );

    const themeReceiver = new TestThemeReceiver();
    await expect(host.subscribeTheme(themeReceiver)).resolves.toEqual({
      mode: "light",
      accentColor: "#7c3aed",
      features: { connections: true, chatModels: true },
    });
    listModels.mockRejectedValueOnce(new Error("Model catalogue unavailable"));
    await expect(host.getChatModelState()).rejects.toThrow("Model catalogue unavailable");
    await expect(host.getChatModelState()).resolves.toEqual({
      models: [
        { id: "gpt-6-luna", name: "GPT-6 Luna" },
      ],
      selectedModelId: "gpt-6-luna",
    });
    await expect(host.setChatModel("gpt-6-luna")).resolves.toMatchObject({ selectedModelId: "gpt-6-luna" });
    for (const model of ["model-b", "removed-model", null]) {
      await expect(host.setChatModel(model)).rejects.toThrow("Invalid chat model selection.");
    }
    expect(window.localStorage.getItem("lastSelectedModel")).toBe("gpt-6-luna");
    await expect(host.getChatModelState()).resolves.toMatchObject({ selectedModelId: "gpt-6-luna" });

    await expect(host.openPrompt("   ")).rejects.toThrow(
      "Gatekeeper app prompt cannot be empty",
    );
    expect(router.state.location.pathname).toBe("/");

    await act(async () => {
      await expect(host!.openPrompt("  Which listings changed?  ")).resolves.toBeUndefined();
      await vi.waitFor(() => expect(router.state.location.pathname).toBe("/ask-bifana"));
    });
    expect(router.state.location.search).toEqual({ prompt: "Which listings changed?" });
  });
});
