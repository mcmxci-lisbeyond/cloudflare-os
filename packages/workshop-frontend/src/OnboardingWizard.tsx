import { useState } from "react";
import { useAuthenticatedApi } from "./AuthContext";

/** Lisbeyond employees arrive through verified sign-in. Source connections and
 * permissions are managed by the organization; completing this welcome grants
 * no access. Chat model defaults belong to modelSelection, not onboarding. */
export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { authenticatedApi, currentUser } = useAuthenticatedApi();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = name ?? currentUser?.name ?? "";
  async function finish() {
    if (saving || !currentUser) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = displayName.trim();
      if (trimmed && trimmed !== currentUser.name)
        await authenticatedApi.setOwnDisplayName(trimmed);
      await authenticatedApi.completeOnboarding();
      onComplete();
    } catch {
      setError("We couldn’t finish setup. Please try again.");
      setSaving(false);
    }
  }
  return (
    <main className="min-h-screen bg-kumo-base flex items-center justify-center p-6">
      <section className="w-full max-w-md space-y-6" aria-labelledby="welcome-heading">
        <div className="space-y-3">
          <p className="text-sm text-kumo-subtle">Lisbeyond OS</p>
          <h1 id="welcome-heading" className="text-3xl font-semibold text-kumo-default">
            Welcome to your workspace
          </h1>
          <p className="text-kumo-subtle">
            Find your properties, follow team workflows and ask Bifana questions about the
            information you’re authorized to see.
          </p>
        </div>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void finish();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="display-name" className="block text-sm font-medium text-kumo-default">
              Display name
            </label>
            <input
              id="display-name"
              autoComplete="name"
              maxLength={120}
              value={displayName}
              onChange={(event) => setName(event.target.value)}
              disabled={saving || !currentUser}
              className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-kumo-default"
            />
          </div>
          <p className="text-sm text-kumo-subtle">
            Your access is managed by Lisbeyond. If something is missing, contact your
            administrator.
          </p>
          {error && (
            <p role="alert" className="text-sm text-kumo-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !currentUser}
            className="w-full rounded-lg bg-kumo-brand px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Opening workspace…" : "Enter Lisbeyond OS"}
          </button>
        </form>
      </section>
    </main>
  );
}
