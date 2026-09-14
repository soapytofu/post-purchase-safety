"use client";

import { useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { importPurchases } from "@/app/actions";
import { parsePurchaseCsv, type CsvParseResult } from "@/lib/csv";

export function ImportForm() {
  const [preview, setPreview] = useState<CsvParseResult | null>(null);
  return <form action={importPurchases} className="stack">
    <label className="drop-zone"><FileUp size={28} /><strong>Choose a purchase CSV</strong><span>Required headers are validated before import.</span><input name="file" type="file" accept=".csv,text/csv" required onChange={async (event) => { const file = event.target.files?.[0]; setPreview(file ? parsePurchaseCsv(await file.text()) : null); }} /></label>
    {preview && <div className={preview.errors.length ? "inline-error" : "preview-ok"}>{preview.errors.length ? preview.errors[0] : `${preview.rows.length} valid row${preview.rows.length === 1 ? "" : "s"} ready to import.`}</div>}
    {preview?.rows.length ? <div className="mini-preview"><div className="mini-preview-head"><span>Preview</span><span>{preview.rows.length} rows</span></div>{preview.rows.slice(0, 3).map((row, index) => <div key={index}><strong>{row.product_name}</strong><span>{row.brand} · {row.retailer}</span></div>)}</div> : null}
    <button className="button button-primary" type="submit" disabled={!preview?.rows.length || Boolean(preview.errors.length)}><Upload size={16} />Import purchases</button>
  </form>;
}
