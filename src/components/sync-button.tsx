import { RefreshCw } from "lucide-react";
import { syncRecalls } from "@/app/actions";

export function SyncButton() {
  return <div className="sync-actions"><form action={syncRecalls}><input type="hidden" name="source" value="live" /><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync FDA</button></form><form action={syncRecalls}><input type="hidden" name="source" value="cpsc" /><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync CPSC</button></form><form action={syncRecalls}><input type="hidden" name="source" value="fixtures" /><button className="fixture-link" type="submit">Reload demo</button></form></div>;
}
