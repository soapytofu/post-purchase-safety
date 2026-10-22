import { verifiedAccount } from "@/lib/auth";
import { BusinessAccessError } from "@/lib/business-data";
import { BusinessCaseError, exportBusinessCase } from "@/lib/business-cases";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string; caseId: string }> }) {
  const identity = await verifiedAccount();
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!identity) return Response.json({ error: "Sign in to export a saved case." }, { status: 401, headers });
  try {
    const { organizationId, caseId } = await params;
    const report = await exportBusinessCase(prisma, identity.id, organizationId, caseId);
    return Response.json(report, { headers: { ...headers, "Content-Disposition": 'attachment; filename="safekeep-recall-case.json"' } });
  } catch (error) {
    if (error instanceof BusinessAccessError) return Response.json({ error: "Case or export permission unavailable." }, { status: 404, headers });
    if (error instanceof BusinessCaseError) return Response.json({ error: error.message }, { status: 422, headers });
    throw error;
  }
}
