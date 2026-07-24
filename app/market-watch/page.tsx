import { redirect } from "next/navigation";

/** Multi-coin watch integrated into Research. */
export default function MarketWatchRedirect() {
  redirect("/strategy-search");
}
