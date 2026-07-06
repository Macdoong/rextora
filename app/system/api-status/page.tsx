import { redirect } from "next/navigation";

export default function SystemApiStatusRedirect() {
  redirect("/system-status");
}
