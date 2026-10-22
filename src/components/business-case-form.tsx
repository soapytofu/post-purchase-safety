"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "@/components/app-link";
import { caseMutation } from "@/app/business/[organizationId]/cases/actions";

export function CaseForm({ organizationId, operation, label, children }: { organizationId: string; operation: string; label: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(caseMutation, { message: "" });
  return <form action={action} className="business-form case-form">
    <input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="operation" value={operation} />
    <fieldset disabled={pending}>{children}<button type="submit" className="button button-primary" disabled={pending}>{pending ? "Saving…" : label}</button></fieldset>
    {state.message && <p role={state.success ? "status" : "alert"} className="business-form-status">{state.message}{operation === "save" && state.caseId && <> <Link href={`/business/${organizationId}/cases/${state.caseId}`}>Open saved case →</Link></>}</p>}
  </form>;
}

export function CaseReviewFields({ quantity, initialStatus }: { quantity: number; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [affectedQuantity, setAffectedQuantity] = useState("");
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  return <>
    <label>Review decision<select name="status" value={status} onChange={event => setStatus(event.target.value)}><option value="NEEDS_REVIEW">Needs review</option><option value="CONFIRMED_AFFECTED">Confirmed affected</option><option value="NOT_AFFECTED">Not affected</option></select></label>
    {status === "CONFIRMED_AFFECTED" && <label>Confirmed affected units<input name="affectedQuantity" type="number" min={1} max={quantity} step={1} required value={affectedQuantity} onChange={event => setAffectedQuantity(event.target.value)} /><span className="case-help">Maximum {quantity.toLocaleString()} units from this saved snapshot. This does not record removal from shelves.</span></label>}
    <label>Review notes<textarea name="note" required minLength={10} maxLength={2000} rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="Record the identifiers checked, your conclusion and any supplier reference." /></label>
    <label className="case-check"><input type="checkbox" name="evidenceReviewed" value="yes" required={status !== "NEEDS_REVIEW"} checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked the official notice and the saved stock identifiers, including applicable lot, model and serial restrictions.</label>
  </>;
}

export function CaseNoteField() {
  const [note, setNote] = useState("");
  return <label>Case note<textarea name="note" required minLength={3} maxLength={2000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label>;
}
