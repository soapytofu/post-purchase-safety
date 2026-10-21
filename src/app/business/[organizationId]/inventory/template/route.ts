import { verifiedAccount } from "@/lib/auth";
import { BusinessAccessError, membershipFor } from "@/lib/business-data";
import { inventoryOptionalHeaders, inventoryRequiredHeaders } from "@/lib/inventory-csv";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const identity = await verifiedAccount();
  const headers = { "Cache-Control": "private, no-store" };
  if (!identity) return Response.json({ error: "Sign in to download the business template." }, { status: 401, headers });
  try {
    const { organizationId } = await params;
    await membershipFor(prisma, identity.id, organizationId, ["OWNER", "MANAGER"]);
    const location = await prisma.businessLocation.findFirst({ where: { organizationId, archivedAt: null }, orderBy: { code: "asc" } });
    const csv = [[...inventoryRequiredHeaders, ...inventoryOptionalHeaders].join(","), [location?.code ?? "MAIN", "EXAMPLE-SKU", "Example product - replace this row", "0", new Date().toISOString(), ...inventoryOptionalHeaders.map(() => "")].join(",")].join("\r\n") + "\r\n";
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="inventory-template.csv"' } });
  } catch (error) {
    if (error instanceof BusinessAccessError) return Response.json({ error: "Business access unavailable." }, { status: 404, headers });
    throw error;
  }
}
