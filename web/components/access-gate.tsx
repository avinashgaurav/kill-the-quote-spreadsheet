"use client";

/**
 * The access-code prompt.
 *
 * Mounted once at the root and invisible until a model route answers 401 for
 * want of a code (see lib/model-fetch.ts). Browsing never triggers it, so a
 * visitor only meets it at the moment something would cost money.
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ACCESS_EVENT, type AccessRequest } from "@/lib/model-fetch";

export function AccessGate() {
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onRequired = (e: Event) => {
      setRequest((e as CustomEvent<AccessRequest>).detail);
      setError(null);
    };
    window.addEventListener(ACCESS_EVENT, onRequired);
    return () => window.removeEventListener(ACCESS_EVENT, onRequired);
  }, []);

  function close(unlocked: boolean) {
    request?.settle(unlocked);
    setRequest(null);
    setCode("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) close(true);
      else setError(String(j.error ?? "That access code is not right."));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Access code</DialogTitle>
            <DialogDescription>
              Reading documents, drafting and asking the analyst are real model calls,
              so this demo asks for a code first. Browsing the comparison and the
              exports stays open without one.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            autoFocus
            autoComplete="off"
            placeholder="Access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !code.trim()}>
              {busy ? "Checking…" : "Unlock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
