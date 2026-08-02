import { describe, it, expect } from "vitest";
import { parseEncounterState } from "@/domain/schema";
import { combatantFromSheet } from "@/domain/factory";
import { reduce } from "@/state/reducer";
import type { CombatSheet } from "@/domain/types";
import { entryKeys, nameKey } from "@/persistence/repositories";

const sheet = (over: Partial<CombatSheet> = {}): CombatSheet => ({
  id: "s1",
  character_name: "Kada Katzenberg",
  sheet_name: "Dynamis Blade",
  role: "Player",
  max_hp: 30,
  stats: { STR: 1, DEX: 1, INT: 0, WIS: 1, AGI: 1, CON: 1 },
  skills: {},
  ...over,
});

const KADA =
  "https://srvqlrmefjyluocwtvkt.supabase.co/storage/v1/object/public/portraits/kada.jpg";

describe("portraits on combatants", () => {
  it("carries a sheet's portrait onto the combatant it creates", () => {
    const c = combatantFromSheet(sheet({ portrait_url: KADA }));
    expect(c.portrait).toBe(KADA);
  });

  it("leaves the field absent rather than empty when there is no portrait", () => {
    const c = combatantFromSheet(sheet());
    expect("portrait" in c).toBe(false);
    // An empty string would render as a broken <img src="">.
    expect(JSON.parse(JSON.stringify(c)).portrait).toBeUndefined();
  });

  it("survives a save and load round trip", () => {
    const c = combatantFromSheet(sheet({ portrait_url: KADA }));
    const { state } = parseEncounterState({ combatants: [c], round: 3, phase: 1 });
    expect(state.combatants[0]!.portrait).toBe(KADA);
  });

  it("rejects a non-http URL smuggled into a shared encounter", () => {
    // The value goes straight into an <img src>, and encounter files get passed
    // around, so javascript: and data: must not survive the parse.
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "  vbscript:msgbox  ",
      "//evil.example.com/x.png",
    ]) {
      const { state } = parseEncounterState({
        combatants: [{ ...combatantFromSheet(sheet()), portrait: hostile }],
        round: 1,
        phase: 0,
      });
      expect(state.combatants[0]!.portrait, hostile).toBeUndefined();
    }
  });

  it("sets and clears a portrait by hand", () => {
    const base = parseEncounterState({
      combatants: [combatantFromSheet(sheet())],
      round: 1,
      phase: 0,
    }).state;
    const id = base.combatants[0]!.id;

    const set = reduce(base, { type: "COMBATANT_PORTRAIT_SET", id, portrait: KADA }).state;
    expect(set.combatants[0]!.portrait).toBe(KADA);

    const cleared = reduce(set, { type: "COMBATANT_PORTRAIT_SET", id, portrait: "  " }).state;
    expect("portrait" in cleared.combatants[0]!).toBe(false);

    const refused = reduce(set, {
      type: "COMBATANT_PORTRAIT_SET",
      id,
      portrait: "javascript:alert(1)",
    }).state;
    expect("portrait" in refused.combatants[0]!).toBe(false);
  });
});

describe("matching sheets to library entries", () => {
  it("ignores case and spacing drift between the two tables", () => {
    expect(nameKey("  Kada   Katzenberg ")).toBe(nameKey("kada katzenberg"));
  });

  it("finds a character listed under a dual identity", () => {
    // The library has "Liam Wilkin/Yuma Hanami"; the combat sheet says
    // "Liam Wilkin". Without splitting on the slash this character loses its
    // portrait for no reason a user could ever guess.
    const keys = entryKeys("Liam Wilkin/Yuma Hanami");
    expect(keys).toContain("liam wilkin");
    expect(keys).toContain("yuma hanami");
    expect(keys).toContain("liam wilkin/yuma hanami");
  });

  it("does not invent keys for an ordinary name", () => {
    expect(entryKeys("Kada Katzenberg")).toEqual(["kada katzenberg"]);
  });
});
