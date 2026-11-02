import {describe, expect, it} from "vitest";
import {
  DEFAULT_ASSISTANT_PERSONA,
  resolveAssistantPersona,
} from "@/lib/ai/assistant-personas.ts";

describe("resolveAssistantPersona", () => {
  it("defaults to analyst", () => {
    expect(resolveAssistantPersona(undefined).id).toBe(DEFAULT_ASSISTANT_PERSONA);
    expect(resolveAssistantPersona("nope").id).toBe("analyst");
  });

  it("resolves audit and keeps scolding language", () => {
    const audit = resolveAssistantPersona("audit");
    expect(audit.id).toBe("audit");
    expect(audit.prompt).toMatch(/scolding|suspicion|auditor/i);
  });

  it("resolves brief as short-form", () => {
    expect(resolveAssistantPersona("brief").prompt).toMatch(/short|KPI/i);
  });
});
