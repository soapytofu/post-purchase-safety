import { Prisma } from "@prisma/client";
import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { BusinessForm } from "@/components/business-form";
import { requireBusinessAccount } from "@/lib/auth";
import { listOrganizations } from "@/lib/business-data";
import { prisma } from "@/lib/prisma";
import { createBusiness } from "./actions";

export default async function Businesses() {
  const identity = await requireBusinessAccount();
  let memberships;
  try { memberships = await listOrganizations(prisma, identity.id); }
  catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2021") throw error;
    return <div className="page"><PageHeader eyebrow="Business workspace" title="Business setup pending" description="The business database migration has not been applied yet. Your household is unchanged." /><Link href="/">Return to household</Link></div>;
  }
  return <div className="page"><PageHeader eyebrow="SafeKeep Business · foundation" title="Your businesses" description="Business teams, locations and inventory stay separate from your household. Recall matching and response workflows come next." action={<Link href="/">Return to household</Link>} />
    <section className="business-grid" aria-label="Your business memberships">{memberships.map(item => <article className="form-card" key={item.id}><p className="eyebrow">{item.role.toLowerCase()}</p><h2>{item.organization.name}</h2><Link className="button button-secondary" href={`/business/${item.organizationId}`}>Open business</Link></article>)}</section>
    {!memberships.length && <p className="empty-state">You haven’t joined a business yet. Create one or accept an invitation from its owner.</p>}
    <section className="form-card business-create"><h2>Create a business</h2><p>You’ll be its owner. Creating a business does not move or expose household purchases.</p><BusinessForm action={createBusiness} label="Create business" pendingLabel="Creating business…"><label>Business name<input name="name" required minLength={2} maxLength={100} placeholder="e.g. Maple & Pine Kids" /></label></BusinessForm><Link href="/business/join">Have an invitation? Join a business</Link></section>
  </div>;
}
