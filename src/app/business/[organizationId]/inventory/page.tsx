import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { SubmitButton } from "@/components/submit-button";
import { InventoryUpload } from "@/components/inventory-upload";
import { requireBusinessAccount } from "@/lib/auth";
import { BusinessAccessError, membershipFor } from "@/lib/business-data";
import { getBusinessInventory } from "@/lib/business-inventory";
import { prisma } from "@/lib/prisma";

const date = (value: Date) => value.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
export default async function Inventory({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { organizationId } = await params;
  const filters = await searchParams;
  const identity = await requireBusinessAccount(`/business/${organizationId}/inventory`);
  let inventory, organization;
  try {
    await membershipFor(prisma, identity.id, organizationId);
    organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    inventory = await getBusinessInventory(prisma, identity.id, organizationId, { locationId: filters.location || undefined, query: filters.q, page: Number(filters.page ?? 1) });
  } catch (error) { if (error instanceof BusinessAccessError) notFound(); throw error; }
  const { membership, locations, rows, total, pages, page, snapshots, totals, history } = inventory;
  const base = `/business/${organizationId}/inventory` as const;
  const href = (nextPage: number) => `${base}?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), ...(filters.location ? { location: filters.location } : {}), page: String(nextPage) })}`;
  return <div className="page"><PageHeader eyebrow={`Business inventory · ${membership.role.toLowerCase()}`} title={`${organization.name} inventory`} description="Stock quantities by store, based on confirmed CSV snapshots—not a live POS connection." action={<Link href={`/business/${organizationId}`}>Team & store settings</Link>} />
    <p className="coverage-warning">Inventory is not yet matched to recalls. Continue checking official notices and your supplier channels. Older stock snapshots may not describe what is on shelves now.</p>
    {membership.role !== "STAFF" && <InventoryUpload organizationId={organizationId} locations={locations.filter(location => !location.archivedAt).map(({ id, name, code }) => ({ id, name, code }))} />}
    <section className="form-card"><h2>Stock by store</h2><div className="inventory-store-grid">{locations.filter(location => !filters.location || location.id === filters.location).map(location => {
      const snapshot = snapshots.find(item => item.locationId === location.id);
      const stock = totals.find(item => item.locationId === location.id);
      return <article key={location.id}><h3>{location.name} · {location.code}</h3>{location.archivedAt ? <p>Archived · excluded from current stock. Historical snapshots are retained.</p> : snapshot ? <><strong>{(stock?._sum.quantityOnHand ?? 0).toLocaleString()} units · {stock?._count ?? 0} stock rows</strong><p>As of {date(snapshot.inventoryAsOf)}</p>{inventory.checkedAt.getTime() - snapshot.inventoryAsOf.getTime() > 86_400_000 && <p className="inventory-stale">Stale: older than 24 hours.</p>}</> : <p>No inventory imported for this store.</p>}</article>;
    })}</div>{!locations.length && <p>No store locations yet. Ask the owner to add one in store settings.</p>}</section>
    <SearchForm key={`${identity.id}:${organizationId}:${filters.q}:${filters.location}`} action={base} historyKey={`safekeep:inventory-search:v1:${identity.id}:${organizationId}`} label="Search inventory" placeholder="Search SKU, product, brand, barcode or model" defaultQuery={filters.q ?? ""}><select aria-label="Store location" name="location" defaultValue={filters.location ?? ""}><option value="">All active stores</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.code}{location.archivedAt ? " (archived)" : ""}</option>)}</select><SubmitButton className="button button-secondary" pendingLabel="Searching…">Filter stock</SubmitButton></SearchForm>
    <section className="table-card"><div className="table-wrap"><table className="inventory-table"><caption>{total.toLocaleString()} current stock rows · page {page} of {pages}</caption><thead><tr><th>Store</th><th>Product / SKU</th><th>Units</th><th>Identifiers</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{locations.find(location => location.id === row.locationId)?.code}</td><td><strong>{row.productName}</strong><span>SKU {row.sku}</span><span>{row.brand || "Brand not provided"}</span></td><td>{row.quantityOnHand}</td><td><details><summary>View identifiers</summary><dl>{[["GTIN", row.gtin], ["Model", row.modelNumber], ["Lot", row.lotNumber], ["Serial", row.serialNumber], ["Production date", row.productionDate], ["Manufacturer", row.manufacturer], ["Supplier", row.supplier], ["Category", row.category]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>{!rows.length && <p className="empty-state">No current stock rows match this view. This is not a safety determination.</p>}</section>
    {pages > 1 && <nav className="pagination" aria-label="Inventory pages"><Link href={href(Math.max(1, page - 1))} aria-disabled={page === 1} className={page === 1 ? "disabled" : ""}>Previous</Link><span>{page} / {pages}</span><Link href={href(Math.min(pages, page + 1))} aria-disabled={page === pages} className={page === pages ? "disabled" : ""}>Next</Link></nav>}
    {membership.role !== "STAFF" && <section className="form-card"><h2>Recent confirmed imports</h2><p>Last 10 imports. Prior snapshots remain stored; re-uploading old content does not reactivate it.</p>{!history.length && <p>No confirmed imports yet.</p>}<ul>{history.map(item => <li key={item.id}>{item.fileName} · {item.appliedAt ? date(item.appliedAt) : "Pending"}</li>)}</ul></section>}
  </div>;
}
