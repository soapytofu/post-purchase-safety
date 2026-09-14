import { RefreshCw } from "lucide-react";
import { syncRecalls } from "@/app/actions";

export function SyncButton() {
  return <form action={syncRecalls}><button className="button button-secondary" type="submit"><RefreshCw size={16} />Sync demo notices</button></form>;
}
