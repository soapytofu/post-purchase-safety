import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { BusinessForm } from "@/components/business-form";
import { requireBusinessAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BusinessAccessError, getBusinessWorkspace } from "@/lib/business-data";
import { businessMutation } from "../actions";

export default async function BusinessWorkspace({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const identity = await requireBusinessAccount(`/business/${organizationId}`);
  let workspace;
  try { workspace = await getBusinessWorkspace(prisma, identity.id, organizationId); }
  catch (error) { if (error instanceof BusinessAccessError) notFound(); throw error; }
  const { organization, membership, locations, members, invitations } = workspace;
  const owner = membership.role === "OWNER";
  const fields = (operation: string) => <><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="operation" value={operation} /></>;
  return <div className="page"><PageHeader eyebrow={`Business workspace · ${membership.role.toLowerCase()}`} title={organization.name} description="Manage store locations, your team and CSV inventory snapshots. Recall matching is not active yet." action={<Link href="/business">Switch business</Link>} />
    <p><Link className="button button-primary" href={`/business/${organizationId}/inventory`}>Open inventory · stock by store</Link></p>
    <p className="coverage-warning">This workspace does not monitor stock yet. Continue using your existing recall and supplier channels.</p>
    <section className="form-card"><h2>Store locations</h2><p>Owners manage locations. Managers and staff can view them. Archive a location to retain its history; codes cannot be reused.</p>
      {!locations.length && <p>No locations yet.{owner ? " Add your first store below." : " Ask the owner to add a location."}</p>}
      <div className="business-grid">{locations.map(location => <article className="business-location" key={location.id}><h3>{location.name}</h3><p><code>{location.code}</code> · {location.archivedAt ? "Archived" : "Active"}</p>{location.address && <p>{location.address}</p>}
        {owner && <><details><summary>Edit location</summary>{!location.archivedAt ? <BusinessForm action={businessMutation} label="Save location">{fields("location")}<input type="hidden" name="locationId" value={location.id} /><input type="hidden" name="code" value={location.code} /><label>Location name<input name="name" defaultValue={location.name} required minLength={2} maxLength={100} /></label><label>Address (optional)<input name="address" defaultValue={location.address} maxLength={250} /></label></BusinessForm> : <p>Restore this location before editing.</p>}</details><BusinessForm action={businessMutation} label={location.archivedAt ? "Restore location" : "Archive location"}>{fields(location.archivedAt ? "restore" : "archive")}<input type="hidden" name="locationId" value={location.id} /></BusinessForm></>}
      </article>)}</div>
      {owner && <details className="business-add" open={!locations.length}><summary>Add a location</summary><BusinessForm action={businessMutation} label="Add location">{fields("location")}<label>Location code<input name="code" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,19}" maxLength={20} placeholder="MAIN" /></label><label>Location name<input name="name" required minLength={2} maxLength={100} placeholder="Main Street store" /></label><label>Address (optional)<input name="address" maxLength={250} /></label></BusinessForm></details>}
      {membership.role !== "STAFF" && <a className="button button-secondary" href={`/business/${organizationId}/export`}>Export locations · JSON</a>}
    </section>
    <section className="form-card"><h2>Team permissions</h2><p>Owner: manage team, locations and inventory. Manager: view/export locations and import inventory. Staff: view locations and inventory. All roles are limited to this business.</p>
      {owner && <><div className="business-grid">{members.map(member => <article className="business-location" key={member.id}><h3>{member.email}</h3><p>{member.role.toLowerCase()}</p>{member.role !== "OWNER" && <BusinessForm action={businessMutation} label="Update member">{fields("member")}<input type="hidden" name="membershipId" value={member.id} /><label>Permission<select name="role" defaultValue={member.role}><option value="MANAGER">Manager</option><option value="STAFF">Staff</option><option value="REMOVE">Remove access</option></select></label></BusinessForm>}</article>)}</div>
        <h3>Invite a teammate</h3><p>Create a private, email-bound link to share yourself. No invitation email is sent. Owner transfers are not supported in this milestone.</p>
        <BusinessForm action={businessMutation} label="Create invitation">{fields("invite")}<label>Teammate email<input name="email" type="email" required maxLength={254} autoComplete="off" /></label><label>Permission<select name="role" defaultValue="STAFF"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select></label></BusinessForm>
        <h3>Pending invitations</h3>{!invitations.length && <p>No pending invitations.</p>}{invitations.map(invitation => <article className="business-location" key={invitation.id}><p>{invitation.email} · {invitation.role.toLowerCase()} · expires {invitation.expiresAt.toLocaleDateString("en-US", { timeZone: "UTC" })}</p><BusinessForm action={businessMutation} label="Revoke invitation">{fields("revoke")}<input type="hidden" name="invitationId" value={invitation.id} /></BusinessForm></article>)}
      </>}
    </section>
    <Link href="/">Switch to household</Link>
  </div>;
}
