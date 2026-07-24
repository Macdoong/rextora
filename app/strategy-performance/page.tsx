import { redirect } from "next/navigation";

/** Legacy strategy performance → Results library. */
export default function StrategyPerformanceRedirect() {
  redirect("/results");
}
