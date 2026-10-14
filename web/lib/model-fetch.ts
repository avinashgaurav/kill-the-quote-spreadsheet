/**
 * `fetch` for the routes that call a model.
 *
 * When the deployment has an access code and this browser has not unlocked,
 * those routes answer 401 with `code: "access_required"`. Rather than every
 * caller learning about that, this asks the <AccessGate /> dialog for the code,
 * waits, and retries the request once. Cancel the dialog and the caller gets
 * the original 401, whose `error` sentence its existing handling already shows.
 */

export const ACCESS_EVENT = "demo-access-required";

export interface AccessRequest {
  /** Called by the dialog: true once unlocked, false if dismissed. */
  settle: (unlocked: boolean) => void;
}

/** Concurrent 401s share one dialog rather than stacking several. */
let pending: Promise<boolean> | null = null;

function askForCode(): Promise<boolean> {
  pending ??= new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<AccessRequest>(ACCESS_EVENT, {
      detail: { settle: resolve },
    }));
  }).finally(() => { pending = null; });
  return pending;
}

export async function modelFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 401) return res;
  const body = await res.clone().json().catch(() => null);
  if (body?.code !== "access_required") return res;
  return (await askForCode()) ? fetch(url, init) : res;
}
