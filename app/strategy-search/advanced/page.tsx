import { redirect } from "next/navigation";

/** Compatibility route — advanced settings live on the main Strategy Search page. */
export default function StrategySearchAdvancedPage() {
  redirect("/strategy-search#ss-section-engine");
}
