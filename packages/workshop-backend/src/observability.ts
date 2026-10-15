import { createObservabilityContext } from "@gadgets/backend-utils/observability-context";
import { createTracer } from "@gadgets/backend-utils/tracing";

/** Observability fields emitted by the Workshop backend. */
export type WorkshopObservabilityFields = {
  accessKeysFresh: boolean;
  accountId: number;
  actionId: number | string;
  autoProvisioned: boolean;
  blueprintId: string;
  callbackInitiated: boolean;
  chatId: number;
  colo: string;
  durableObjectId: string;
  durationMs: number;
  eventName: string;
  executionId: string;
  failureCount: number;
  gadgetId: string;
  gatekeeperId: number | string;
  isolateAgeMs: number;
  logBytes: number;
  modelId: string;
  observerId: string;
  operation: string;
  outcome: "ok" | "error" | "usage_limit" | "callbacks_stalled" | "no_email" | "signups_disabled";
  path: string;
  requestInIsolate: number;
  resourceTitle: string;
  sequence: number;
  size: number;
  status: number;
  statusCode: number;
  statusText: string;
  toolCallId: string;
  toolName: string;
  vendorId: string;
  verifyMs: number;
};

/** Ambient observability fields for one Workshop operation. */
export const obsContext = createObservabilityContext<WorkshopObservabilityFields>();

/** Creates a logger restricted to the Workshop backend's field vocabulary. */
export function createWorkshopLogger(component: string) {
  return obsContext.createLogger({ component });
}

/** Runs `callback` in a trace span carrying the ambient observability fields as attributes. */
export const traced = createTracer(obsContext.get);
