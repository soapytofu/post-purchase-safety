import { verifiedAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BusinessAccessError, exportBusinessLocations } from "@/lib/business-data";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const identity = await verifiedAccount();
  const headers = { "Cache-Control": "private, no-store" };
  if (!identity) return Response.json({ error: "Sign in to export business locations." }, { status: 401, headers });
  try {
    const { organizationId } = await params;
    const data = await exportBusinessLocations(prisma, identity.id, organizationId);
    return Response.json(data, { headers: { ...headers, "Content-Disposition": 'attachment; filename="business-locations.json"' } });
  } catch (error) {
    if (error instanceof BusinessAccessError) return Response.json({ error: "Business workspace or permission unavailable." }, { status: 404, headers });
    throw error;
  }
}
