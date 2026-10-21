"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmInventoryAction, inventoryPreviewPageAction, previewInventoryAction } from "@/app/business/[organizationId]/inventory/actions";
import type { InventoryPreview } from "@/lib/business-inventory";

const date = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

function InventoryReview({ initial, organizationId }: { initial: InventoryPreview; organizationId: string }) {
  const [preview, setPreview] = useState(initial);
  const [error, setError] = useState("");
  const [paging, startPaging] = useTransition();
  const [state, confirm, pending] = useActionState(confirmInventoryAction, { message: "" });
  const move = (page: number) => startPaging(async () => {
    try {
      const result = await inventoryPreviewPageAction(organizationId, initial.id, page);
      setError(result.message);
      if (result.preview) setPreview(result.preview);
    } catch { setError("Preview could not be loaded. Refresh and check your access."); }
  });
  return <section className="inventory-review" aria-labelledby="inventory-review-title"><h3 id="inventory-review-title">Review {initial.fileName}</h3>
    <p>{initial.rowCount.toLocaleString()} stock rows. {initial.status === "DRAFT" ? `Preview expires ${date(initial.expiresAt)}.` : "This content was already imported and will not be applied again."}</p>
    <p className="coverage-warning">Complete replacement—not an addition. Missing SKUs will leave current stock for the stores below. Other stores are untouched. Historical snapshots are retained.</p>
    <div className="inventory-store-grid">{initial.stores.map(store => <article key={store.id}><strong>{store.name} · {store.code}</strong><p>{store.previousRows} → {store.rowCount} stock rows · {store.previousUnits.toLocaleString()} → {store.units.toLocaleString()} units</p><p>{store.removedRows} previous row{store.removedRows === 1 ? "" : "s"} absent from this file.</p><p>Inventory as of {date(store.inventoryAsOf)}</p>{new Date(initial.checkedAt).getTime() - new Date(store.inventoryAsOf).getTime() > 86_400_000 && <p className="inventory-stale">Older than 24 hours: historical stock estimate.</p>}</article>)}</div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {!error && <div className="table-wrap"><table className="inventory-table"><caption>Preview rows · page {preview.page} of {preview.pages}</caption><thead><tr><th>CSV line / store</th><th>Product / SKU</th><th>Units</th><th>Identifiers and details</th></tr></thead><tbody>{preview.rows.map(row => <tr key={`${row.line}:${row.location_code}`}><td>{row.line} · {row.location_code}</td><td><strong>{row.product_name}</strong><span>SKU {row.sku}</span><span>{row.brand || "Brand not provided"}</span></td><td>{row.quantity_on_hand}</td><td><details><summary>View fields</summary><dl>{Object.entries(row).filter(([key]) => !["line", "location_code", "product_name", "sku", "quantity_on_hand"].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value) || "Not provided"}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>}
    {preview.pages > 1 && <nav className="pagination" aria-label="Preview pages"><button type="button" className="button button-secondary" disabled={paging || preview.page <= 1} onClick={() => move(preview.page - 1)}>Previous rows</button><span>{paging ? "Loading…" : `${preview.page} / ${preview.pages}`}</span><button type="button" className="button button-secondary" disabled={paging || preview.page >= preview.pages} onClick={() => move(preview.page + 1)}>Next rows</button></nav>}
    {initial.status === "DRAFT" && <form action={confirm} className="business-form"><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="draftId" value={initial.id} /><label className="inventory-confirm"><input type="checkbox" name="confirmed" value="yes" required disabled={pending || state.done} />I confirm this file contains complete stock for the listed stores and approve replacing their current quantities.</label><button type="submit" className="button button-primary" disabled={pending || state.done || Boolean(error)}>{pending ? "Importing inventory…" : state.done ? "Import complete" : "Confirm & replace selected stock"}</button>{state.message && <p role="status" aria-live="polite" className="business-form-status">{state.message}</p>}</form>}
  </section>;
}

export function InventoryUpload({ organizationId, locations }: { organizationId: string; locations: { id: string; name: string; code: string }[] }) {
  const [state, action, pending] = useActionState(previewInventoryAction, { message: "" });
  const [changed, setChanged] = useState(false);
  return <section className="form-card"><h2>Upload inventory CSV</h2><p>Select exactly the active stores represented in the file. Each store needs at least one row, one inventory timestamp, and complete stock—not just changes. Zero quantities are supported. No stock changes until you confirm the preview.</p>
    <p>UTF-8 CSV · up to 5 MB · 10,000 rows. Required columns: <code>location_code, sku, product_name, quantity_on_hand, inventory_as_of</code>. Timestamps need a timezone.</p>
    <a href={`/business/${organizationId}/inventory/template`} className="button button-secondary">Download CSV template · replace example row</a>
    {!locations.length ? <p>Add or restore a store location before importing.</p> : <form action={action} className="business-form" onChange={() => setChanged(true)} onSubmit={() => setChanged(false)}><fieldset disabled={pending}><input type="hidden" name="organizationId" value={organizationId} /><fieldset className="inventory-location-picker"><legend>Stores to replace</legend>{locations.map(location => <label key={location.id}><input type="checkbox" name="locationId" value={location.id} />{location.name} · {location.code}</label>)}</fieldset><label>Inventory CSV file<input type="file" name="file" accept=".csv,text/csv" required /></label><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Validating inventory…" : "Preview & validate CSV"}</button></fieldset></form>}
    {!changed && state.message && <p role="status" aria-live="polite" className="business-form-status">{state.message}</p>}
    {!changed && Boolean(state.issueCount) && <div className="inventory-issues" role="region" aria-label="CSV validation issues"><p>{state.issueCount! > (state.issues?.length ?? 0) ? `Showing the first ${state.issues?.length} of ${state.issueCount} issues. The entire import is blocked.` : "Every listed issue must be corrected; no rows have been imported."}</p><ul>{state.issues?.map((issue, index) => <li key={index}>Line {issue.line} · <strong>{issue.field}</strong>: {issue.message}</li>)}</ul></div>}
    {!changed && state.preview && <InventoryReview key={state.preview.id} initial={state.preview} organizationId={organizationId} />}
  </section>;
}
