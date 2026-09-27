import { notFound } from "next/navigation";
import { getScenario } from "@/lib/catalog";
import CallConsole from "@/components/CallConsole";

export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ scenario: string }>;
  searchParams: Promise<{ replay?: string }>;
}) {
  const { scenario: id } = await params;
  const { replay } = await searchParams;
  const scenario = getScenario(id);
  if (!scenario) notFound();
  const fixture = replay === "held" ? `${id}-held` : replay ? id : null;
  return <CallConsole scenario={scenario} fixtureId={fixture} />;
}
