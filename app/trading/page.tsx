import { redirect } from "next/navigation";

/** Legacy /trading redirects to paper trading; live is separate. */
export default function TradingRedirect() {
  redirect("/paper-trading");
}
