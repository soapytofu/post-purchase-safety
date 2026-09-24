import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

export default async function Purchases({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams; const query = params.q ?? ""; const status = params.status ?? "all";
  const purchases = await prisma.purchase.findMany({ where: { AND: [query ? { OR: [{ productName: { contains: query } }, { brand: { contains: query } }, { retailer: { contains: query } }] } : {}, status === "matches" ? { matches: { some: {} } } : status === "clear" ? { matches: { none: {} } } : {}] }, include: { matches: true }, orderBy: { purchaseDate: "desc" } });
  return <div className="page"><PageHeader eyebrow="Purchase ledger" title="Everything you’re tracking" description="A local record used only to check for relevant product safety notices." action={<Link href="/add" className="button button-primary"><Plus size={16} />Add purchase</Link>} />
    {params.added && <div className="flash">Purchase added and checked against current notices.</div>}{params.imported && <div className="flash">Imported and checked {params.imported} purchases.</div>}{params.receipt && <div className="flash">Saved and checked {params.receipt} item{params.receipt === "1" ? "" : "s"} from your receipt.</div>}
    <form className="toolbar"><label className="search"><Search size={17} /><input name="q" defaultValue={query} placeholder="Search product, brand, or retailer" /></label><select name="status" defaultValue={status}><option value="all">All recall states</option><option value="matches">Potential matches</option><option value="clear">None found in checked data</option></select><button className="button button-secondary">Apply</button></form>
    <section className="table-card"><div className="table-wrap"><table><thead><tr><th>Product</th><th>Purchased</th><th>Identifier</th><th>Source</th><th>Recall status</th></tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.productName}</strong><span>{purchase.brand} · {purchase.category}</span></td><td>{date(purchase.purchaseDate)}<span>{purchase.retailer}</span></td><td className="mono">{purchase.upc || purchase.lotNumber || "Not provided"}<span>{purchase.upc && purchase.lotNumber ? `Lot ${purchase.lotNumber}` : ""}</span></td><td><span className="source-pill">{purchase.source.toLowerCase()}</span></td><td>{purchase.matches.length ? <Link href="/alerts" className="recall-state attention">{purchase.matches.length} potential match{purchase.matches.length > 1 ? "es" : ""}</Link> : <span className="recall-state checked">None found in checked data</span>}</td></tr>)}</tbody></table></div>{!purchases.length && <div className="empty-state">No purchases match these filters.</div>}</section>
  </div>;
}
