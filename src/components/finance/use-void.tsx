"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INPUT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";

/**
 * A small inline "why" form, so nothing in Finance is voided without a
 * reason on record. `target` is the ref being voided, or null when closed.
 */
export function useVoid(action: (ref: string, reason: string) => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const confirm = () => {
    if (!target) return;
    startTransition(async () => {
      const result = await action(target, reason);
      if (!result.ok) {
        toast({ tone: "error", title: "Not voided", description: result.error, key: "finance-void" });
        return;
      }
      toast({ tone: "success", title: `${target} voided`, description: done, key: "finance-void" });
      setTarget(null);
      setReason("");
      router.refresh();
    });
  };
  const form = (
    <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 8 }}>
      <input style={{ ...INPUT, flex: 1, minWidth: 180 }} value={reason} maxLength={300} placeholder="Why is this being voided?" onChange={(event) => setReason(event.target.value)} />
      <Button size="sm" variant="secondary" onClick={confirm} disabled={pending}>
        {pending ? "Voiding…" : "Void it"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setTarget(null)} disabled={pending}>
        Keep
      </Button>
    </div>
  );
  return { target, setTarget, form };
}
