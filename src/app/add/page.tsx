import { CalendarDays, FileSpreadsheet, Plus, ShoppingBag } from "lucide-react";
import { addPurchase } from "@/app/actions";
import { ImportForm } from "@/components/import-form";
import { PageHeader } from "@/components/page-header";
import { ReceiptScanner } from "@/components/receipt-scanner";

export default async function Add({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return <div className="page"><PageHeader eyebrow="Add / import" title="Track a recent purchase" description="The more identifying detail you provide, the more precise a potential recall match can be." />
    {params.error && <div className="inline-error">{params.error}</div>}
    <ReceiptScanner />
    <div className="form-grid"><section className="form-card"><div className="form-card-heading"><span><ShoppingBag size={20} /></span><div><h2>Add one purchase</h2><p>Checked immediately against saved notices.</p></div></div><form action={addPurchase} className="purchase-form"><label className="wide">Product name *<input name="productName" required placeholder="e.g. Romaine Lettuce Salad Kit" /></label><label>Brand *<input name="brand" required placeholder="e.g. Green Valley" /></label><label>Category *<input name="category" required placeholder="e.g. Packaged Produce" /></label><label>Retailer *<input name="retailer" required placeholder="e.g. Whole Foods" /></label><label>Purchase date *<span className="input-icon"><CalendarDays size={16} /><input name="purchaseDate" type="date" required /></span></label><label>UPC / GTIN <input name="upc" inputMode="numeric" placeholder="12–14 digits" /></label><label>Lot number <input name="lotNumber" placeholder="Printed on package" /></label><button className="button button-primary wide" type="submit"><Plus size={16} />Save & check purchase</button></form></section>
      <section className="form-card"><div className="form-card-heading"><span><FileSpreadsheet size={20} /></span><div><h2>Import a CSV</h2><p>Best for receipts or an existing ledger.</p></div></div><ImportForm /><a className="sample-link" href="/sample-purchases.csv" download>Download sample CSV</a><div className="format-help"><strong>Expected columns</strong><code>product_name, brand, purchase_date, retailer, upc, lot_number, category</code></div></section></div>
  </div>;
}
