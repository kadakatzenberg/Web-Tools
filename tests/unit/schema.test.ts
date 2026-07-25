import { describe, expect, it } from "vitest";
import { parseEncounterState, parseSheets, parseSkillRows } from "@/domain/schema";
import { abilityFromSheetSkill, combatantFromSheet } from "@/domain/factory";
import { makeCombatant } from "./helpers";

describe("session serialisation", () => {
  it("round-trips a full encounter without loss", () => {
    const state = {
      combatants: [
        makeCombatant({
          id: "c1",
          name: "Kada",
          hp: 12,
          maxHp: 20,
          shield: 3,
          tempShields: [{ id: "t", val: 2, duration: 3, label: "ward" }],
          dots: [{ id: "d", name: "Bleed", dmg: 2, type: "physical" as const, permanent: false, duration: 2 }],
          statuses: [{ id: "s", name: "Prone", duration: 2 }],
          tempMods: [{ id: "m", stat: "STR" as const, val: 2, duration: 2, label: "rage" }],
          abilities: [
            { id: "a", name: "Strike", mode: "cooldown" as const, max: 2, cur: 1, gainPerPhase: 1 },
          ],
        }),
      ],
      phase: 1,
      round: 4,
      locked: true,
      playerPhaseCount: 3,
      enemyPhaseCount: 4,
    };
    const json = JSON.parse(JSON.stringify(state));
    const { state: parsed, repaired } = parseEncounterState(json);
    expect(repaired).toBe(false);
    expect(parsed.round).toBe(4);
    expect(parsed.phase).toBe(1);
    expect(parsed.combatants[0]!.name).toBe("Kada");
    expect(parsed.combatants[0]!.tempShields[0]!.val).toBe(2);
    expect(parsed.combatants[0]!.abilities[0]!.cur).toBe(1);
  });

  it("fills in collections missing from a legacy record", () => {
    const legacy = {
      combatants: [
        {
          id: "old",
          name: "Legacy",
          role: "Enemy",
          hp: 5,
          maxHp: 10,
          shield: 0,
          stats: { STR: 1, DEX: 0, INT: 0, WIS: 0, AGI: 0, CON: 0 },
          position: "Front",
          done: false,
        },
      ],
      phase: 0,
      round: 2,
    };
    const { state } = parseEncounterState(legacy);
    const c = state.combatants[0]!;
    expect(c.tempShields).toEqual([]);
    expect(c.dots).toEqual([]);
    expect(c.hpRegens).toEqual([]);
    expect(c.abilities).toEqual([]);
    expect(c.statuses).toEqual([]);
    expect(c.tempMods).toEqual([]);
    expect(c.sheetSkills).toEqual({});
    expect(state.locked).toBe(false);
    expect(state.playerPhaseCount).toBe(0);
  });

  it("preserves the legacy scalar hpRegen field", () => {
    const { state } = parseEncounterState({
      combatants: [{ id: "x", name: "R", role: "Player", hp: 5, maxHp: 10, hpRegen: 4 }],
    });
    expect(state.combatants[0]!.hpRegen).toBe(4);
  });

  it("repairs a non-positive maxHp rather than dividing by zero", () => {
    const { state } = parseEncounterState({
      combatants: [{ id: "x", name: "Broken", role: "Player", hp: 7, maxHp: 0 }],
    });
    expect(state.combatants[0]!.maxHp).toBeGreaterThan(0);
  });

  it("drops unparseable combatants and flags the repair", () => {
    const { state, repaired } = parseEncounterState({
      combatants: [{ id: "ok", name: "Fine", role: "Player", hp: 5, maxHp: 10 }, null, 42],
    });
    expect(state.combatants).toHaveLength(1);
    expect(repaired).toBe(true);
  });

  it("falls back to an empty encounter for junk input", () => {
    expect(parseEncounterState(null).state.combatants).toEqual([]);
    expect(parseEncounterState("nonsense").state.round).toBe(1);
    expect(parseEncounterState(undefined).repaired).toBe(true);
  });

  it("coerces an out-of-range phase back into the legal set", () => {
    expect(parseEncounterState({ combatants: [], phase: 9 }).state.phase).toBe(0);
  });
});

describe("legacy sheet loading", () => {
  it("parses stats and skills delivered as JSON strings", () => {
    const { sheets } = parseSheets([
      {
        id: "s1",
        character_name: "Kada",
        sheet_name: "Sakura",
        role: "Player",
        max_hp: 18,
        stats: JSON.stringify({ STR: 2, DEX: 1, INT: 0, WIS: 0, AGI: 1, CON: 1 }),
        skills: JSON.stringify({ s1: { name: "Cut", mode: "cooldown", maxVal: 3 } }),
      },
    ]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.stats.STR).toBe(2);
    expect(sheets[0]!.skills.s1?.name).toBe("Cut");
  });

  it("discards skill slots with no name", () => {
    const { sheets } = parseSheets([
      {
        id: "s2",
        character_name: "X",
        sheet_name: "Y",
        role: "Player",
        max_hp: 10,
        stats: {},
        skills: { s1: { name: "" }, s2: { name: "Real" } },
      },
    ]);
    expect(sheets[0]!.skills.s1).toBeUndefined();
    expect(sheets[0]!.skills.s2?.name).toBe("Real");
  });

  it("survives malformed JSON in a stored column", () => {
    const { sheets } = parseSheets([
      {
        id: "s3",
        character_name: "Z",
        sheet_name: "W",
        role: "Player",
        max_hp: 10,
        stats: "{not json",
        skills: "{also not json",
      },
    ]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.stats.STR).toBe(0);
    expect(sheets[0]!.skills).toEqual({});
  });

  it("defaults a missing or invalid max_hp to 15", () => {
    const { sheets } = parseSheets([
      { id: "s4", character_name: "A", sheet_name: "B", role: "Player", stats: {}, skills: {} },
    ]);
    expect(sheets[0]!.max_hp).toBe(15);
  });

  it("returns an empty list for a non-array payload", () => {
    expect(parseSheets({ error: "boom" }).sheets).toEqual([]);
  });
});

describe("sheet to combatant mapping", () => {
  it("defaults cooldown and reaction capacity to 2 and others to 1", () => {
    expect(abilityFromSheetSkill("s1", { name: "A", mode: "cooldown" }).max).toBe(2);
    expect(abilityFromSheetSkill("s1", { name: "A", mode: "reaction" }).max).toBe(2);
    expect(abilityFromSheetSkill("s1", { name: "A", mode: "ammo" }).max).toBe(1);
  });

  it("loads ammo abilities to full on entry", () => {
    const a = abilityFromSheetSkill("s1", { name: "Bow", mode: "ammo", maxVal: 4 });
    expect(a.cur).toBe(4);
  });

  it("starts cooldown abilities ready", () => {
    expect(abilityFromSheetSkill("s1", { name: "Cut", mode: "cooldown", maxVal: 3 }).cur).toBe(0);
  });

  it("prefixes the ultimate slot", () => {
    expect(abilityFromSheetSkill("ult", { name: "Finisher" }).name).toBe("ULT: Finisher");
  });

  it("carries a phase lock across only when set", () => {
    const locked = abilityFromSheetSkill("s1", { name: "A", phaseLock: 3, phaseLockType: "enemy" });
    expect(locked.phaseLock).toBe(3);
    expect(locked.phaseLockType).toBe("enemy");
    expect(abilityFromSheetSkill("s1", { name: "A" }).phaseLock).toBeUndefined();
  });

  it("builds a tracker combatant with the sheet display name", () => {
    const c = combatantFromSheet({
      id: "s",
      character_name: "Kada",
      sheet_name: "Sakura Speed",
      role: "Player",
      max_hp: 18,
      stats: { STR: 1, DEX: 2, INT: 0, WIS: 0, AGI: 1, CON: 1 },
      skills: { s1: { name: "Cut", mode: "cooldown", maxVal: 2 } },
    });
    expect(c.name).toBe("Kada (Sakura Speed)");
    expect(c.maxHp).toBe(18);
    expect(c.hp).toBe(18);
    expect(c.abilities).toHaveLength(1);
    expect(c.sheetSkills.s1?.name).toBe("Cut");
  });
});

describe("skill row parsing", () => {
  it("keeps well-formed rows and drops broken ones", () => {
    const rows = parseSkillRows([
      { id: 1, name: "Slash", mode: "cooldown", max_val: 2, gain_per_phase: 1, effect: "hit" },
      null,
      { id: 2, name: "Guard", mode: "not-a-mode", max_val: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.mode).toBe("cooldown"); // coerced from an unknown mode
  });
});
