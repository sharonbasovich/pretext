import type { Scenario } from "./scenario";
import helpdeskPretext from "../scenarios/helpdesk-pretext.json";
import billingDispute from "../scenarios/billing-dispute.json";
import elderlyBilingual from "../scenarios/elderly-bilingual.json";
import vendorBec from "../scenarios/vendor-bec.json";

/**
 * Static scenario catalog — the four Pretext personas.
 * Import statically so it works client-side without fs access.
 */
export const SCENARIOS: Scenario[] = [
  helpdeskPretext as Scenario,
  billingDispute as Scenario,
  elderlyBilingual as Scenario,
  vendorBec as Scenario,
];

export function getScenario(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
