"use client";

import { Download, Trash2 } from "lucide-react";
import { deleteAllPurchases } from "@/app/actions";

export function PrivacyControls({ purchaseCount }: { purchaseCount: number }) {
  return <div className="privacy-controls">
    <a className="button button-secondary" href="/api/export"><Download size={16} />Export my data</a>
    <form action={deleteAllPurchases} onSubmit={(event) => { if (!window.confirm(`Delete all ${purchaseCount} tracked purchase${purchaseCount === 1 ? "" : "s"} and their match history from this device? This cannot be undone.`)) event.preventDefault(); }}><button className="button button-danger" type="submit" disabled={!purchaseCount}><Trash2 size={16} />Delete purchase history</button></form>
  </div>;
}
