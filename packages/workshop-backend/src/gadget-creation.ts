/** Whether this deployment permits new gadgets; unset preserves existing deployments. */
export function isGadgetCreationEnabled(value: string | undefined): boolean {
  return value !== "false";
}

/** Reject creation before model calls, workspace allocation, or gadget storage writes. */
export function requireGadgetCreationEnabled(value: string | undefined): void {
  if (!isGadgetCreationEnabled(value)) {
    throw new Error("Gadget creation is temporarily disabled.");
  }
}
