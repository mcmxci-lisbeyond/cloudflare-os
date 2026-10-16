// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */

// LIS-301: Cloudflare sheds the stateless isolate that holds the /api WebSocket every few minutes.
// Each reconnect used to remount the employee's app frame (a full reload of the page they were on).
// The frame now stays mounted and its calls move to the new session's `ui`.
//
// Ways this could fail, each covered below:
// 1. A reconnect still remounts the iframe.
// 2. After a reconnect the app's calls keep going to the dead capability.
// 3. Calls made while the connection is down fail instead of waiting for the new capability.
// 4. Those waiting calls never settle when reopening the app fails and the frame goes away.
// 5. The frame survives a change of signed-in employee (or an identity that cannot be confirmed).
// 6. The frame survives a change of HTML (a new deployment).
// 7. The previous session's `ui` is never released.
// 8. A call already in flight at the cut is retried (it may have reached the server: a write could
//    repeat). It must fail as before.
// 9. The untrusted frame can pause or redirect its own capability over RPC.
// 10. Calls queued while the connection is down bypass the frame's rate limit when they are sent.
// 11. After reopening fails once, the automatic retry brings back the old frame on the closed
//     connection, so the app's first calls fail and it is stuck until a manual reload.

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { newMessagePortRpcSession, type RpcStub } from "capnweb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatekeeperUiFrame } from "@gadgets/workshop-shared/gatekeeper";
import GatekeeperAppPage from "./GatekeeperAppPage";
import { RailConnectionsProvider } from "./components/AppShell/railConnectionsContext";

vi.mock("./ThemeContext", () => ({ useTheme: () => ({ resolvedThemeMode: "light" }) }));
vi.mock("./ServerConfigContext", () => ({ useServerConfig: () => ({ accentColor: "#7c3aed" }) }));
vi.mock("./errorReporting", () => ({ forwardTrustedFrameError: () => false, reportIssue: () => {} }));

const HTML = "<!doctype html><title>Lisbeyond OS</title>";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stands in for the gatekeeper `ui` stub carried by one /api WebSocket session.
class FakeConnection {
  readonly calls: string[] = [];
  readonly disposed = vi.fn();
  #broken = false;
  #onBroken: ((error: unknown) => void)[] = [];
  #pending: ((error: Error) => void)[] = [];
  constructor(readonly name: string) {}
  whereAmI(label: string): Promise<string> {
    if (this.#broken) return Promise.reject(new Error("Peer closed WebSocket: 1006"));
    this.calls.push(label);
    return Promise.resolve(`${this.name}:${label}`);
  }
  slowWrite(label: string): Promise<string> {
    this.calls.push(label);
    return new Promise((_resolve, reject) => { this.#pending.push(reject); });
  }
  onRpcBroken(callback: (error: unknown) => void): void { this.#onBroken.push(callback); }
  cut(): void {
    this.#broken = true;
    const error = new Error("Peer closed WebSocket: 1006");
    for (const reject of this.#pending.splice(0)) reject(error);
    for (const callback of this.#onBroken) callback(error);
  }
  [Symbol.dispose](): void { this.disposed(); }
}

type AppCalls = { whereAmI(label: string): Promise<string>; slowWrite(label: string): Promise<string> };
// The hold/replace names the frame would have to guess if they were string-keyed.
type Host = { ui: AppCalls; holdCapability(): void; replaceCapability(next: string): void };

let session: { api: ReturnType<typeof sessionApi> };
function sessionApi(connection: FakeConnection, viewer: string | Error = "bram@lisbeyond.com", html = HTML) {
  return {
    getGatekeeperApp: vi.fn(async () => ({ iframeHtml: html, ui: connection }) as unknown as GatekeeperUiFrame),
    whoami: vi.fn(async () => {
      if (viewer instanceof Error) throw viewer;
      return { type: "user", id: viewer, name: "Bram" };
    }),
    listGadgets: vi.fn(async () => []),
    listModels: vi.fn(async () => []),
  };
}
vi.mock("./AuthContext", () => ({ useAuthenticatedApi: () => ({ authenticatedApi: session.api }) }));

describe("GatekeeperAppPage across a reconnect", () => {
  let container: HTMLDivElement;
  let root: Root;
  let host: RpcStub<Host> | undefined;
  let rerender: () => void;

  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(async () => {
    host?.[Symbol.dispose]();
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function mount(first: FakeConnection) {
    session = { api: sessionApi(first) };
    function Page() {
      const [, setTick] = useState(0);
      rerender = () => setTick(value => value + 1);
      return <RailConnectionsProvider><GatekeeperAppPage appId="lisbeyond" appRoute="workflows" /></RailConnectionsProvider>;
    }
    const rootRoute = createRootRoute({ component: Page });
    const workflows = createRoute({ getParentRoute: () => rootRoute, path: "/workflows" });
    const router = createRouter({ history: createMemoryHistory({ initialEntries: ["/workflows"] }), routeTree: rootRoute.addChildren([workflows]) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root.render(<RouterProvider router={router} />));
    await vi.waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const iframe = container.querySelector("iframe")!;
    const { port1, port2 } = new MessageChannel();
    host = newMessagePortRpcSession<Host>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: iframe.contentWindow, ports: [port2] }));
    await expect(host.ui.whereAmI("first")).resolves.toBe("one:first");
    return iframe;
  }

  async function reconnect(api: ReturnType<typeof sessionApi>) {
    session = { api };
    await act(async () => rerender());
    await vi.waitFor(() => expect(api.getGatekeeperApp).toHaveBeenCalled());
  }

  it("keeps the iframe and moves the app's calls to the new session", async () => {
    const one = new FakeConnection("one");
    const iframe = await mount(one);
    one.cut();
    const two = new FakeConnection("two");
    await reconnect(sessionApi(two));
    await expect(host!.ui.whereAmI("after")).resolves.toBe("two:after");
    expect(container.querySelector("iframe")).toBe(iframe);
    expect(one.calls).toEqual(["first"]);
    await vi.waitFor(() => expect(one.disposed).toHaveBeenCalled());
    expect(two.disposed).not.toHaveBeenCalled();
  });

  it("holds calls made while disconnected and fails, not retries, the call in flight at the cut", async () => {
    const one = new FakeConnection("one");
    await mount(one);
    const inFlight = host!.ui.slowWrite("approve");
    await vi.waitFor(() => expect(one.calls).toContain("approve"));
    one.cut();
    await expect(inFlight).rejects.toThrow("Peer closed WebSocket");
    const waiting = host!.ui.whereAmI("during-outage");
    await new Promise(resolve => setTimeout(resolve, 20));
    const two = new FakeConnection("two");
    await reconnect(sessionApi(two));
    await expect(waiting).resolves.toBe("two:during-outage");
    expect(two.calls).toEqual(["during-outage"]);
    expect(one.calls.filter(call => call === "approve")).toHaveLength(1);
  });

  it.each([
    ["another employee", "francisco@lisbeyond.com", HTML],
    ["an identity that cannot be confirmed", new Error("whoami failed"), HTML],
    ["new frame HTML", "bram@lisbeyond.com", "<!doctype html><title>Lisbeyond OS v2</title>"],
  ])("starts a fresh frame for %s", async (_case, viewer, html) => {
    const one = new FakeConnection("one");
    const iframe = await mount(one);
    one.cut();
    await reconnect(sessionApi(new FakeConnection("two"), viewer, html));
    await vi.waitFor(() => expect(container.querySelector("iframe")).not.toBe(iframe));
    expect(container.querySelector("iframe")).not.toBeNull();
  });

  it("rejects calls still waiting when reopening the app fails", async () => {
    const one = new FakeConnection("one");
    await mount(one);
    one.cut();
    const waiting = host!.ui.whereAmI("during-outage");
    const failing = sessionApi(new FakeConnection("two"));
    failing.getGatekeeperApp.mockRejectedValue(new Error("Gatekeeper app is not configured"));
    await reconnect(failing);
    // Settles once the frame is gone (its MessagePort session closes first), never hangs.
    await expect(waiting).rejects.toThrow();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("recovers with a working frame when the first reopen fails", async () => {
    const one = new FakeConnection("one");
    await mount(one);
    host![Symbol.dispose]();
    one.cut();
    const two = new FakeConnection("two");
    const flaky = sessionApi(two);
    flaky.getGatekeeperApp
      .mockRejectedValueOnce(new Error("Peer closed WebSocket: 1006"))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(
        () => resolve({ iframeHtml: HTML, ui: two } as unknown as GatekeeperUiFrame), 50)));
    await reconnect(flaky);
    await vi.waitFor(() => expect(flaky.getGatekeeperApp).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await vi.waitFor(() => expect(container.querySelector("iframe")).not.toBeNull());
    const iframe = container.querySelector("iframe")!;
    const { port1, port2 } = new MessageChannel();
    host = newMessagePortRpcSession<Host>(port1);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "handshake" }, origin: "null", source: iframe.contentWindow, ports: [port2] }));
    await expect(host.ui.whereAmI("first-load")).resolves.toBe("two:first-load");
  });

  it("does not let the frame pause or redirect its own capability", async () => {
    await mount(new FakeConnection("one"));
    await expect(host!.holdCapability()).rejects.toThrow();
    await expect(host!.replaceCapability("evil")).rejects.toThrow();
    await expect(host!.ui.whereAmI("still-mine")).resolves.toBe("one:still-mine");
  });

  it("sends calls queued during an outage through the rate limit", async () => {
    const one = new FakeConnection("one");
    await mount(one);
    one.cut();
    // The frame allows 8 concurrent calls; the rest stay queued until earlier ones finish.
    const slow = Array.from({ length: 10 }, (_, index) => host!.ui.slowWrite(`queued-${index}`));
    await new Promise(resolve => setTimeout(resolve, 20));
    const two = new FakeConnection("two");
    await reconnect(sessionApi(two));
    await vi.waitFor(() => expect(two.calls).toHaveLength(8));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(two.calls).toHaveLength(8);
    // Unmounting (afterEach) settles the two still queued.
    void Promise.allSettled(slow);
  });
});
