import { describe, expect, it } from "vitest";
import {
  checkRoll,
  d20Roll,
  d20Term,
  looksLikeDice,
  scatterRoll,
  swingFor,
  wrapDice,
} from "@/domain/dice";
import { formatEnemyPhaseBlock } from "@/domain/report";
import type { EncounterState } from "@/domain/types";
import { makeCombatant, stats } from "./helpers";

function encounter(partial: Partial<EncounterState> = {}): EncounterState {
  return {
    combatants: partial.combatants ?? [],
    phase: partial.phase ?? 1,
    round: partial.round ?? 1,
    locked: true,
    playerPhaseCount: 1,
    enemyPhaseCount: 1,
  };
}

const status = (name: string) => ({ id: name, name, duration: 2 });

describe("advantage detection", () => {
  it("reads Advantage and Disadvantage from statuses", () => {
    expect(swingFor({ statuses: [status("Advantage")] })).toBe("advantage");
    expect(swingFor({ statuses: [status("Disadvantage")] })).toBe("disadvantage");
    expect(swingFor({ statuses: [] })).toBe("normal");
  });

  it("cancels when a combatant holds both", () => {
    expect(swingFor({ statuses: [status("Advantage"), status("Disadvantage")] })).toBe(
      "normal",
    );
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(swingFor({ statuses: [status(" advantage ")] })).toBe("advantage");
    expect(swingFor({ statuses: [status("DISADVANTAGE")] })).toBe("disadvantage");
  });

  it("ignores unrelated statuses", () => {
    expect(swingFor({ statuses: [status("Prone"), status("Bound")] })).toBe("normal");
  });
});

describe("d20 notation", () => {
  it("uses keep-highest for advantage and keep-lowest for disadvantage", () => {
    expect(d20Term("normal")).toBe("1d20");
    expect(d20Term("advantage")).toBe("2d20kh1");
    expect(d20Term("disadvantage")).toBe("2d20kl1");
  });

  it("builds a plain roll", () => {
    expect(d20Roll()).toBe("{{1d20}}");
  });

  it("appends a positive bonus and prints a negative one", () => {
    expect(d20Roll({ bonus: 4 })).toBe("{{1d20+4}}");
    expect(d20Roll({ bonus: -2 })).toBe("{{1d20-2}}");
  });

  it("omits a zero bonus rather than printing +0", () => {
    expect(d20Roll({ bonus: 0 })).toBe("{{1d20}}");
  });

  it("combines swing and bonus with die modifiers before arithmetic", () => {
    expect(d20Roll({ bonus: 4, swing: "advantage" })).toBe("{{2d20kh1+4}}");
    expect(d20Roll({ bonus: -1, swing: "disadvantage" })).toBe("{{2d20kl1-1}}");
  });

  it("flags crits without disturbing the arithmetic", () => {
    expect(d20Roll({ bonus: 2, flagCrits: true })).toBe("{{1d20cscf=1+2}}");
    expect(d20Roll({ swing: "advantage", flagCrits: true })).toBe("{{2d20kh1cscf=1}}");
  });
});

describe("scatter roll", () => {
  it("sizes the die to the number of targets and prints a legend", () => {
    expect(scatterRoll(["Kada", "Dawn", "Seika"])).toBe(
      "{{1d3}} — 1: Kada. 2: Dawn. 3: Seika.",
    );
  });

  it("returns nothing when there is nobody to hit", () => {
    expect(scatterRoll([])).toBe("");
  });
});

describe("author-supplied notation", () => {
  it("accepts plausible notation", () => {
    for (const s of ["1d4", "2d6!", "4d6kh3", "1d20+4", "6d10>=8f=1", "d%"]) {
      expect(looksLikeDice(s), s).toBe(true);
    }
  });

  it("rejects empty input, braces, and prose", () => {
    expect(looksLikeDice("")).toBe(false);
    expect(looksLikeDice("   ")).toBe(false);
    expect(looksLikeDice("{{1d4}}")).toBe(false);
    expect(looksLikeDice("roll a d4 please")).toBe(false); // no digits after the d
    expect(looksLikeDice("x".repeat(200))).toBe(false);
  });

  it("wraps notation and tolerates braces the author already typed", () => {
    expect(wrapDice("1d4")).toBe("{{1d4}}");
    expect(wrapDice("{{1d4}}")).toBe("{{1d4}}");
    expect(wrapDice("  2d6!  ")).toBe("{{2d6!}}");
    expect(wrapDice("")).toBe("");
  });
});

describe("enemy phase block with dice features", () => {
  it("rolls with advantage when the enemy holds it", () => {
    const s = encounter({
      combatants: [
        makeCombatant({
          id: "e",
          name: "Void Horde",
          role: "Enemy",
          stats: stats({ DEX: 2 }),
          statuses: [status("Advantage")],
        }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Kada" }])).toBe(
      "VOID HORDE — Kada [ADV]\n{{2d20kh1+4}}",
    );
  });

  it("rolls with disadvantage and tags the line", () => {
    const s = encounter({
      combatants: [
        makeCombatant({
          id: "e",
          name: "Colossus",
          role: "Enemy",
          stats: stats(),
          statuses: [status("Disadvantage")],
        }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Aulbaux" }])).toBe(
      "COLOSSUS — Aulbaux [DIS]\n{{2d20kl1}}",
    );
  });

  it("leaves the line untagged when advantage and disadvantage cancel", () => {
    const s = encounter({
      combatants: [
        makeCombatant({
          id: "e",
          name: "Horde",
          role: "Enemy",
          stats: stats(),
          statuses: [status("Advantage"), status("Disadvantage")],
        }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Kada" }])).toBe(
      "HORDE — Kada\n{{1d20}}",
    );
  });

  it("adds crit flags when asked", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ id: "e", name: "Horde", role: "Enemy", stats: stats({ DEX: 1 }) }),
      ],
    });
    expect(
      formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Kada" }], { flagCrits: true }),
    ).toBe("HORDE — Kada\n{{1d20cscf=1+2}}");
  });

  it("emits a scatter roll for an attack on everyone", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Kada", role: "Player" }),
        makeCombatant({ name: "Dawn", role: "Player" }),
        makeCombatant({ id: "e", name: "Bloat", role: "Enemy", stats: stats() }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "everyone" }])).toBe(
      "BLOAT — everyone\n{{1d20}}\n{{1d2}} — 1: Kada. 2: Dawn.",
    );
  });

  it("does not scatter into a wiped party", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Kada", role: "Player", hp: 0 }),
        makeCombatant({ id: "e", name: "Bloat", role: "Enemy", stats: stats() }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "everyone" }])).toBe(
      "BLOAT — everyone\n{{1d20}}",
    );
  });
});

describe("stat checks", () => {
  it("names the stat and the DC beside the roll", () => {
    expect(checkRoll({ stat: "CON", dc: 12, bonus: 2 })).toBe(
      "CON check, DC 12 — {{1d20+2}}",
    );
  });

  it("carries a negative modifier", () => {
    expect(checkRoll({ stat: "WIS", dc: 13, bonus: -1 })).toBe(
      "WIS check, DC 13 — {{1d20-1}}",
    );
  });

  it("omits a zero modifier rather than writing +0", () => {
    expect(checkRoll({ stat: "AGI", dc: 11 })).toBe("AGI check, DC 11 — {{1d20}}");
  });

  it("honours Advantage and Disadvantage", () => {
    expect(checkRoll({ stat: "STR", dc: 14, bonus: 1, swing: "advantage" })).toBe(
      "STR check, DC 14 — {{2d20kh1+1}}",
    );
    expect(checkRoll({ stat: "STR", dc: 14, bonus: 1, swing: "disadvantage" })).toBe(
      "STR check, DC 14 — {{2d20kl1+1}}",
    );
  });
});
