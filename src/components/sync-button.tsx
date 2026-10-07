import { RefreshCw } from "lucide-react";
import { syncRecalls } from "@/app/actions";
import { localPilotAllowed } from "@/lib/auth";

export async function SyncButton() {
  if (!(await localPilotAllowed())) return <span className="metric-caption">Check source freshness below</span>;
  return <div className="sync-actions"><form action={syncRecalls}><input type="hidden" name="source" value="live" /><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync FDA</button></form><form action={syncRecalls}><input type="hidden" name="source" value="fsis" /><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync USDA</button></form><form action={syncRecalls}><input type="hidden" name="source" value="cpsc" /><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync CPSC</button></form><form action={syncRecalls}><input type="hidden" name="source" value="fixtures" /><button className="fixture-link" type="submit">Reload demo</button></form></div>;
}
