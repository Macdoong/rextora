import { redirect } from "next/navigation";

/** Trade history shown under paper trading details. */
export default function TradesRedirect() {
  redirect("/paper-trading");
}
