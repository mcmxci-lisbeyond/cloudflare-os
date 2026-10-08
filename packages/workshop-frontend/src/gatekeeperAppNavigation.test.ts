import { describe, expect, it } from "vitest";
import {
  GATEKEEPER_APP_ROUTES,
  gatekeeperAppCanReportConnections,
  MAX_GATEKEEPER_APP_CONNECTIONS,
  MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH,
  MAX_GATEKEEPER_APP_PROMPT_LENGTH,
  normalizeGatekeeperAppPrompt,
  parseGatekeeperAppConnections,
  parseGatekeeperAppRoute,
  parseWorkflowRouteState,
  parsePropertyRouteState,
  parsePropertyGuideTarget,
  parseGuideSourceUrl,
  parseGatekeeperAppWorkspaceTarget,
} from "./gatekeeperAppNavigation";

const WORKSPACE_ID = "a".repeat(64);

describe("guide navigation targets", () => {
  it("accepts canonical property identity only", () => {
    expect(parsePropertyGuideTarget("P9004")).toBe("P9004");
    for (const value of [null, {}, "p9004", "P9004/../admin", "P9004&P9005", "P12345", "Avenida apartment"]) {
      expect(() => parsePropertyGuideTarget(value)).toThrow("Invalid property guide target");
    }
  });
  it.each(["https://www.notion.so/fixture-guide", "https://app.notion.com/fixture-revision", "https://slack.com/archives/C12345678/p1780000000000000", "https://lisbeyond.slack.com/archives/C12345678/p1780000000000000", "https://lisbeyondsf2025.my.salesforce.com/lightning/r/Property__c/a0P000000000001AAA/view", "https://lisbeyondsf2025.my.salesforce.com/lightning/r/Lead/00Q000000000001AAA/view", "https://drive.google.com/drive/folders/fixture", "https://docs.google.com/document/d/fixture/edit"])("accepts a governed source %s", value => {
    expect(parseGuideSourceUrl(value)).toBe(value);
  });
  it.each([null, {}, "javascript:alert(1)", "http://www.notion.so/page", "https://notion.so.evil.test/page", "https://evil.test/page", "https://user@notion.so/page", "https://notion.so:8443/page", "https://slack.com/redirect?url=https://evil.test", "https://other.my.salesforce.com/lightning/r/Lead/00Q/view", "https://lisbeyondsf2025.my.salesforce.com.evil.test/page", "http://lisbeyondsf2025.my.salesforce.com/page", "https://lisbeyondsf2025.my.salesforce.com:8443/page", "https://google.com/url?q=https://evil.test", "https://drive.google.com.evil.test/file", "https://user@docs.google.com/document/d/x", "https://www.notion.so/" + "x".repeat(2000)])("rejects an unsupported source %s", value => {
    expect(() => parseGuideSourceUrl(value)).toThrow("Invalid guide source link");
  });
});

const VALID_CONNECTION = {
  id: "hostaway",
  name: "Hostaway",
  state: "live",
  detail: "Live",
} as const;

describe("gatekeeperAppCanReportConnections", () => {
  it("allows only the Lisbeyond app to publish host-rail status", () => {
    expect(gatekeeperAppCanReportConnections("lisbeyond")).toBe(true);
    expect(gatekeeperAppCanReportConnections("scheduler")).toBe(false);
    expect(gatekeeperAppCanReportConnections("context")).toBe(false);
  });
});

describe("parseGatekeeperAppConnections", () => {
  it("accepts and reduces a valid connection list", () => {
    expect(parseGatekeeperAppConnections([
      { ...VALID_CONNECTION, ignored: true },
      { id: "salesforce", name: "Salesforce", state: "partial", detail: "Needs access" },
      { id: "notion", name: "Notion", state: "off", detail: "Not connected" },
    ])).toEqual([
      VALID_CONNECTION,
      { id: "salesforce", name: "Salesforce", state: "partial", detail: "Needs access" },
      { id: "notion", name: "Notion", state: "off", detail: "Not connected" },
    ]);
  });

  it.each([
    null,
    {},
    "hostaway",
    Array.from({ length: MAX_GATEKEEPER_APP_CONNECTIONS + 1 }, () => VALID_CONNECTION),
  ])("rejects a non-list or oversized list: %s", (value) => {
    expect(() => parseGatekeeperAppConnections(value)).toThrow(
      "Invalid gatekeeper app connection report",
    );
  });

  it.each([
    {},
    { ...VALID_CONNECTION, id: undefined },
    { ...VALID_CONNECTION, id: "Hostaway" },
    { ...VALID_CONNECTION, id: "hostaway/calendar" },
    { ...VALID_CONNECTION, id: "x".repeat(MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH + 1) },
    { ...VALID_CONNECTION, name: "" },
    { ...VALID_CONNECTION, name: "x".repeat(MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH + 1) },
    { ...VALID_CONNECTION, state: "stale" },
    { ...VALID_CONNECTION, detail: "" },
    { ...VALID_CONNECTION, detail: "x".repeat(MAX_GATEKEEPER_APP_CONNECTION_TEXT_LENGTH + 1) },
  ])("rejects an invalid row: %s", (row) => {
    expect(() => parseGatekeeperAppConnections([row])).toThrow(
      "Invalid gatekeeper app connection report",
    );
  });
});

describe("parseGatekeeperAppWorkspaceTarget", () => {
  it("accepts a workspace ID with an optional gadget", () => {
    expect(parseGatekeeperAppWorkspaceTarget(WORKSPACE_ID, undefined)).toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(parseGatekeeperAppWorkspaceTarget(WORKSPACE_ID, 0)).toEqual({
      workspaceId: WORKSPACE_ID,
      gadgetId: 0,
    });
  });

  it.each([
    ["", undefined],
    ["../admin", undefined],
    [WORKSPACE_ID.toUpperCase(), undefined],
    [`${WORKSPACE_ID}a`, undefined],
    [WORKSPACE_ID, -1],
    [WORKSPACE_ID, 1.5],
    [WORKSPACE_ID, 9_007_199_254_740_992],
    [WORKSPACE_ID, "1"],
  ])("rejects (%s, %s)", (workspaceId, gadgetId) => {
    expect(() => parseGatekeeperAppWorkspaceTarget(workspaceId, gadgetId)).toThrow(
      "Invalid gatekeeper app workspace target",
    );
  });
});

describe("normalizeGatekeeperAppPrompt", () => {
  it("trims a bounded visible prompt", () => {
    expect(normalizeGatekeeperAppPrompt("  Set up a daily brief.  ")).toBe("Set up a daily brief.");
  });

  it("rejects empty and oversized prompts", () => {
    expect(() => normalizeGatekeeperAppPrompt("   ")).toThrow("cannot be empty");
    expect(() =>
      normalizeGatekeeperAppPrompt("x".repeat(MAX_GATEKEEPER_APP_PROMPT_LENGTH + 1)),
    ).toThrow("too long");
  });
});

describe("parseGatekeeperAppRoute", () => {
  it.each(Object.keys(GATEKEEPER_APP_ROUTES))("accepts %s", (route) => {
    expect(parseGatekeeperAppRoute(route)).toBe(route);
  });

  it.each([
    "",
    "/admin",
    "../properties",
    "portfolio/../admin",
    "portfolio/business-pulse?refresh=1",
    "portfolio/business-pulse#report",
    "portfolio%2Fbusiness-pulse",
    "portfolio/unknown",
    "sales/../admin",
    "sales/new-leads?write=1",
    "https://example.com",
    null,
    1,
  ])(
    "rejects %s",
    (route) => {
      expect(() => parseGatekeeperAppRoute(route)).toThrow(
        "Invalid gatekeeper app route",
      );
    },
  );
});

describe("workflow URL state", () => {
  it("retains the bounded pending invoice deep link and drops unrelated state", () => {
    expect(parseWorkflowRouteState({ workflow: "renovations-invoice-intake", tab: "invoices", status: "awaiting_approval", item: "item-123_abc", token: "private", url: "https://evil.example" })).toEqual({ workflow: "renovations-invoice-intake", tab: "invoices", status: "awaiting_approval", item: "item-123_abc" });
  });
  it.each(["to_review", "decided", "needs_help"] as const)("retains the reviewed invoice view %s", status => {
    expect(parseWorkflowRouteState({ workflow: "renovations-invoice-intake", tab: "invoices", status }))
      .toEqual({ workflow: "renovations-invoice-intake", tab: "invoices", status });
  });
  it("drops invalid, oversized and array values without accepting another path", () => {
    expect(parseWorkflowRouteState({ workflow: "../../settings", tab: "admin", status: ["approved"], item: "x".repeat(201) })).toEqual({});
    expect(parseWorkflowRouteState(null)).toEqual({});
    expect(parseWorkflowRouteState({ item: "<script>" })).toEqual({});
  });
});

describe("property URL state", () => {
  it.each(["guide", "feedback", "reviews"])("normalizes a bounded %s property workspace deep link", tab => {
    expect(parsePropertyRouteState({
      property: " p0478 ",
      tab,
      q: "river",
      service: "property_management",
      region: "Lisbon",
      status: "active",
      scroll: "620",
      token: "private",
    })).toEqual({
      property: "P0478",
      tab,
      q: "river",
      service: "property_management",
      region: "Lisbon",
      status: "active",
      scroll: 620,
    });
  });

  it("retains an invalid marker across repeated boundary validation", () => {
    const once = parsePropertyRouteState({ property: "../../settings", tab: "activity" });
    expect(once).toEqual({ invalidProperty: "../../SETTINGS", tab: "activity" });
    expect(parsePropertyRouteState(once)).toEqual(once);
  });

  it("drops oversized and unsupported filter state", () => {
    expect(parsePropertyRouteState({
      property: "P12345",
      tab: "admin",
      q: "x".repeat(101),
      service: "finance",
      region: "x".repeat(101),
      status: "deleted",
      scroll: -1,
    })).toEqual({ invalidProperty: "P12345" });
  });
});
