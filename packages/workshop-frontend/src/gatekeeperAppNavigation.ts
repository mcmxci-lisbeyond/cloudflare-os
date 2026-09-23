import type { GatekeeperAppPropertyRouteState } from "@gadgets/workshop-shared/theme";

export const MAX_GATEKEEPER_APP_PROMPT_LENGTH = 4_000;

export const GATEKEEPER_APP_ROUTES = {
  home: "/",
  properties: "/properties",
  portfolio: "/portfolio",
  "portfolio/revenue-management": "/portfolio/revenue-management",
  "portfolio/business-pulse": "/portfolio/business-pulse",
  "portfolio/new-leads": "/portfolio/new-leads",
  "sales/new-leads": "/sales/new-leads",
  "ask-bifana": "/ask-bifana",
  workflows: "/workflows",
  connections: "/connections",
  settings: "/settings",
} as const;

export type GatekeeperAppRoute = keyof typeof GATEKEEPER_APP_ROUTES;

export const MAX_GATEKEEPER_APP_CONNECTIONS = 12;
export const MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH = 40;
const CONNECTION_REPORTING_GATEKEEPER_ID = "lisbeyond";

export type GatekeeperAppConnection = {
  id: string;
  name: string;
  state: "live" | "partial" | "off";
  detail: string;
};

export function gatekeeperAppCanReportConnections(gatekeeperVendorId: string): boolean {
  return gatekeeperVendorId === CONNECTION_REPORTING_GATEKEEPER_ID;
}

const CONNECTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONNECTION_STATES = new Set<GatekeeperAppConnection["state"]>([
  "live",
  "partial",
  "off",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGatekeeperAppConnection(value: unknown): GatekeeperAppConnection {
  if (!isRecord(value)) throw new TypeError("Invalid gatekeeper app connection report.");
  const { id, name, state, detail } = value;
  if (
    typeof id !== "string"
    || id.length > MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH
    || !CONNECTION_ID_PATTERN.test(id)
    || typeof name !== "string"
    || name.length === 0
    || name.length > MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH
    || typeof state !== "string"
    || !CONNECTION_STATES.has(state as GatekeeperAppConnection["state"])
    || typeof detail !== "string"
    || detail.length === 0
    || detail.length > MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH
  ) {
    throw new TypeError("Invalid gatekeeper app connection report.");
  }
  return { id, name, state: state as GatekeeperAppConnection["state"], detail };
}

/** Validates and reduces an untrusted connection summary reported by a sandboxed app. */
export function parseGatekeeperAppConnections(value: unknown): GatekeeperAppConnection[] {
  if (!Array.isArray(value) || value.length > MAX_GATEKEEPER_APP_CONNECTIONS) {
    throw new TypeError("Invalid gatekeeper app connection report.");
  }
  return value.map(parseGatekeeperAppConnection);
}

// A Durable Object ID string, which is what a workspace ID is.
const WORKSPACE_ID_PATTERN = /^[0-9a-f]{64}$/;

export type GatekeeperAppWorkspaceTarget = { workspaceId: string; gadgetId?: number };

/**
 * Validates a workspace target arriving from a sandboxed gatekeeper app before the host navigates
 * to it. The app is untrusted input, so the shape is checked here rather than at the router.
 */
export function parseGatekeeperAppWorkspaceTarget(
  workspaceId: unknown,
  gadgetId: unknown,
): GatekeeperAppWorkspaceTarget {
  if (typeof workspaceId !== "string" || !WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new TypeError("Invalid gatekeeper app workspace target.");
  }
  if (gadgetId === undefined) return { workspaceId };
  if (typeof gadgetId !== "number" || !Number.isSafeInteger(gadgetId) || gadgetId < 0) {
    throw new TypeError("Invalid gatekeeper app workspace target.");
  }
  return { workspaceId, gadgetId };
}

export function normalizeGatekeeperAppPrompt(value: string): string {
  if (typeof value !== "string") throw new TypeError("Gatekeeper app prompt must be text.");
  const prompt = value.trim();
  if (!prompt) throw new TypeError("Gatekeeper app prompt cannot be empty.");
  if (prompt.length > MAX_GATEKEEPER_APP_PROMPT_LENGTH) {
    throw new RangeError("Gatekeeper app prompt is too long.");
  }
  return prompt;
}

/**
 * Gatekeeper apps are sandboxed and may only request one of the explicitly supported internal
 * destinations. They never supply an arbitrary path or external URL to the Workshop router.
 */
export function parseGatekeeperAppRoute(value: unknown): GatekeeperAppRoute {
  if (typeof value !== "string" || !(value in GATEKEEPER_APP_ROUTES)) {
    throw new TypeError("Invalid gatekeeper app route.");
  }
  return value as GatekeeperAppRoute;
}

/** Supported workflow deep-link state; it carries navigation only, never authority. */
export type WorkflowRouteState = {
  workflow?: string;
  tab?: "invoices" | "overview" | "activity" | "about";
  status?: "to_review" | "decided" | "needs_help" | "all" | "awaiting_approval" |
    "approved" | "handed_off" | "rejected" | "needs_human";
  item?: string;
};

/** Drop unknown or malformed URL fields instead of forwarding arbitrary host state. */
export function parseWorkflowRouteState(value: unknown): WorkflowRouteState {
  if (!isRecord(value)) return {};
  const state: WorkflowRouteState = {};
  if (typeof value.workflow === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.workflow)) state.workflow = value.workflow;
  if (typeof value.tab === "string" && ["invoices", "overview", "activity", "about"].includes(value.tab)) state.tab = value.tab as WorkflowRouteState["tab"];
  if (typeof value.status === "string" && ["to_review", "decided", "needs_help", "all",
    "awaiting_approval", "approved", "handed_off", "rejected", "needs_human"].includes(value.status)) {
    state.status = value.status as WorkflowRouteState["status"];
  }
  if (typeof value.item === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value.item)) state.item = value.item;
  return state;
}

const PROPERTY_TABS = new Set(["overview", "guide", "operations", "feedback", "reviews", "activity"]);

/** Exact property identity for a cross-page guide link; navigation conveys no read authority. */
export function parsePropertyGuideTarget(value: unknown): string {
  if (typeof value !== "string" || !/^P\d{4}$/.test(value)) {
    throw new TypeError("Invalid property guide target.");
  }
  return value;
}

/** Only the existing governed guide/review destinations may escape the app frame. */
export function parseGuideSourceUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) throw new TypeError("Invalid guide source link.");
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError("Invalid guide source link."); }
  const notion = ["notion.so", "www.notion.so", "notion.com", "www.notion.com", "app.notion.com"].includes(url.hostname);
  const slack = (url.hostname === "slack.com" || /^[a-z0-9-]+\.slack\.com$/.test(url.hostname))
    && /^\/archives\/[CG][A-Z0-9]{8,}\/p\d+$/.test(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || (!notion && !slack)) {
    throw new TypeError("Invalid guide source link.");
  }
  return url.href;
}
const PROPERTY_SERVICES = new Set(["property_management", "upkeep"]);
const PROPERTY_STATUSES = new Set(["active", "onboarding", "prospect", "inactive", "attention", "offboarding", "unknown"]);

/** Keep only bounded property navigation state before it crosses the iframe boundary. */
export function parsePropertyRouteState(value: unknown): GatekeeperAppPropertyRouteState {
  if (!isRecord(value)) return {};
  const state: GatekeeperAppPropertyRouteState = {};
  if (typeof value.property === "string") {
    const property = value.property.trim().toUpperCase();
    if (/^P\d{4}$/.test(property)) state.property = property;
    else if (property.length > 0 && property.length <= 100) state.invalidProperty = property;
  }
  if (
    !state.property
    && !state.invalidProperty
    && typeof value.invalidProperty === "string"
    && value.invalidProperty.length > 0
    && value.invalidProperty.length <= 100
  ) {
    state.invalidProperty = value.invalidProperty;
  }
  if (typeof value.tab === "string" && PROPERTY_TABS.has(value.tab)) {
    state.tab = value.tab as GatekeeperAppPropertyRouteState["tab"];
  }
  if (typeof value.q === "string" && value.q.length <= 100) state.q = value.q;
  if (typeof value.service === "string" && PROPERTY_SERVICES.has(value.service)) {
    state.service = value.service as GatekeeperAppPropertyRouteState["service"];
  }
  if (typeof value.region === "string" && value.region.length > 0 && value.region.length <= 100) {
    state.region = value.region;
  }
  if (typeof value.status === "string" && PROPERTY_STATUSES.has(value.status)) {
    state.status = value.status as GatekeeperAppPropertyRouteState["status"];
  }
  const scroll = typeof value.scroll === "string" && /^\d+$/.test(value.scroll)
    ? Number(value.scroll)
    : value.scroll;
  if (typeof scroll === "number" && Number.isSafeInteger(scroll) && scroll >= 0 && scroll <= 10_000_000) {
    state.scroll = scroll;
  }
  return state;
}
