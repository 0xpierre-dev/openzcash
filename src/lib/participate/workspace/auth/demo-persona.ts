export const DEMO_PERSONAS = ["participant", "committee"] as const;
export type DemoPersona = typeof DEMO_PERSONAS[number];

// Fixed local fixtures, never an arbitrary account or a client-supplied role.
export const DEMO_USER_IDS: Record<DemoPersona, string> = {
  participant: "preview_participant",
  committee: "preview_maya"
};
export function demoPersonaForUser(userId: string): DemoPersona | undefined {
  return DEMO_PERSONAS.find(persona => DEMO_USER_IDS[persona] === userId);
}
