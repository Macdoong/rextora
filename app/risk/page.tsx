import { redirect } from "next/navigation";

/** Risk controls live under System Settings. */
export default function RiskRedirect() {
  redirect("/settings#risk");
}
