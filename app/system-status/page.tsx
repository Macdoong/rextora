import { redirect } from "next/navigation";

/** System status moved into System Settings. */
export default function SystemStatusRedirect() {
  redirect("/settings#system");
}
