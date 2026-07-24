import { redirect } from "next/navigation";
import { ExpertStrategiesPage } from "@/components/rextora/strategy/ExpertStrategiesPage";

export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: Promise<{ expert?: string }>;
}) {
  const sp = await searchParams;
  if (sp.expert === "1") {
    return <ExpertStrategiesPage />;
  }
  redirect("/strategy-search");
}
