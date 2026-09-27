import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getScenario, SCENARIOS } from "@/lib/catalog";
import CallConsole from "@/components/CallConsole";

export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ scenario: s.id }));
}

export default async function CallPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: id } = await params;
  const scenario = getScenario(id);
  if (!scenario) notFound();
  return (
    <Suspense>
      <CallConsole scenario={scenario} />
    </Suspense>
  );
}
