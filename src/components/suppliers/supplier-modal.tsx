"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSupplierAction, updateSupplierAction } from "@/app/actions/suppliers";
import { Field, INPUT, Modal, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { parseWholeNumber } from "@/lib/fleet";
import type { Supplier } from "@/types";

/** Adds a supplier, or edits one when `supplier` is given. */
export function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (ref: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [terms, setTerms] = useState(supplier?.terms ?? "");
  const [lead, setLead] = useState(supplier?.leadTimeDays == null ? "" : String(supplier.leadTimeDays));
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const leadTimeDays = parseWholeNumber(lead);
    if (leadTimeDays === undefined) {
      setError("Delivery time must be a whole number of days.");
      return;
    }
    setError(null);
    const input = { name, contactPerson, phone, email, terms, leadTimeDays, notes };
    startTransition(async () => {
      const result = supplier
        ? { ...(await updateSupplierAction(supplier.ref, input)), ref: supplier.ref }
        : await createSupplierAction(input);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Supplier not saved", description: result.error, key: "supplier-save" });
        return;
      }
      toast({
        tone: "success",
        title: supplier ? `${name.trim()} saved` : `${name.trim()} added`,
        description: supplier ? undefined : `Saved as ${result.ref}. Add the parts they sell next.`,
        key: "supplier-save",
      });
      router.refresh();
      onSaved(result.ref);
    });
  };

  return (
    <Modal
      title={supplier ? `Edit ${supplier.name}` : "New supplier"}
      icon="truck"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : supplier ? "Save" : "Add supplier"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Name" required>
        <input style={INPUT} value={name} maxLength={120} placeholder="Davao Auto Parts" onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Contact person">
          <input style={INPUT} value={contactPerson} maxLength={120} onChange={(event) => setContactPerson(event.target.value)} />
        </Field>
        <Field label="Phone">
          <input style={INPUT} type="tel" value={phone} maxLength={40} onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label="Email">
          <input style={INPUT} type="email" value={email} maxLength={120} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Payment terms">
          <input style={INPUT} value={terms} maxLength={80} placeholder="Cash, 30 days" onChange={(event) => setTerms(event.target.value)} />
        </Field>
        <Field label="Usual delivery time (days)">
          <input style={INPUT} inputMode="numeric" value={lead} maxLength={3} onChange={(event) => setLead(event.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} maxLength={600} style={{ ...INPUT, resize: "vertical" }} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
    </Modal>
  );
}
