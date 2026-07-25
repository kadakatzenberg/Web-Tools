import { describe, expect, it } from "vitest";
import {
  enemyCondition,
  formatEnemyPhaseBlock,
  formatPendingPost,
  formatPhaseAnnouncement,
  formatStatusPost,
  pendingCombatants,
  rollTargets,
} from "@/domain/report";
import type { EncounterState } from "@/domain/types";
import { makeCombatant, seededRng, stats } from "./helpers";

function encounter(partial: Partial<EncounterState> = {}): EncounterState {
  return {
    combatants: partial.combatants ?? [],
    phase: partial.phase ?? 0,
    round: partial.round ?? 1,
    locked: partial.locked ?? true,
    playerPhaseCount: partial.playerPhaseCount ?? 1,
    enemyPhaseCount: partial.enemyPhaseCount ?? 0,
  };
}

describe("enemy condition vocabulary", () => {
  it("uses the words the table actually uses", () => {
    expect(enemyCondition(10, 10)).toBe("Fresh");
    expect(enemyCondition(9, 10)).toBe("Hurt");
    expect(enemyCondition(6, 10)).toBe("Hurt");
    expect(enemyCondition(5, 10)).toBe("Badly Hurt");
    expect(enemyCondition(1, 10)).toBe("Badly Hurt");
    expect(enemyCondition(0, 10)).toBe("DEAD");
    expect(enemyCondition(-4, 10)).toBe("DEAD");
  });
});

describe("phase announcement", () => {
  it("numbers the player phase by the player counter", () => {
    expect(formatPhaseAnnouncement(encounter({ phase: 0, playerPhaseCount: 3 }))).toBe(
      "PLAYER PHASE 3",
    );
  });

  it("numbers the enemy phase by the enemy counter", () => {
    expect(formatPhaseAnnouncement(encounter({ phase: 1, enemyPhaseCount: 6 }))).toBe(
      "ENEMY PHASE 6",
    );
  });

  it("labels the environment phase by round", () => {
    expect(formatPhaseAnnouncement(encounter({ phase: 2, round: 4 }))).toBe(
      "ENVIRONMENT PHASE — Round 4",
    );
  });

  it("appends a mention when asked", () => {
    expect(formatPhaseAnnouncement(encounter({ phase: 0, playerPhaseCount: 2 }), true)).toBe(
      "PLAYER PHASE 2 @here",
    );
  });
});

describe("status post", () => {
  const state = encounter({
    combatants: [
      makeCombatant({
        name: "Kada",
        role: "Player",
        hp: 14,
        maxHp: 15,
        shield: 2,
        tempShields: [{ id: "t", val: 3, duration: 2 }],
      }),
      makeCombatant({ name: "Seika", role: "Player", hp: 0, maxHp: 15 }),
      makeCombatant({ name: "Void Horde 1", role: "Enemy", hp: 2, maxHp: 10 }),
      makeCombatant({ name: "Void Horde 2", role: "Enemy", hp: 10, maxHp: 10 }),
      makeCombatant({ name: "Chain Binder", role: "Enemy", hp: 0, maxHp: 15 }),
    ],
  });

  it("gives the party exact numbers", () => {
    const out = formatStatusPost(state);
    expect(out).toContain("Kada: 14/15 | Shield: 5");
  });

  it("marks a downed party member", () => {
    expect(formatStatusPost(state)).toContain("Seika: 0/15 | Shield: 0 | DOWN");
  });

  it("gives enemies a condition word and never a number", () => {
    const out = formatStatusPost(state);
    expect(out).toContain("Void Horde 1: Badly Hurt");
    expect(out).toContain("Void Horde 2: Fresh");
    expect(out).toContain("Chain Binder: DEAD");
    // The enemy section must not leak exact HP.
    const enemySection = out.slice(out.indexOf("ENEMIES"));
    expect(enemySection).not.toMatch(/\d+\/\d+/);
  });

  it("lists party conditions and modifiers", () => {
    const s = encounter({
      combatants: [
        makeCombatant({
          name: "Meora",
          role: "Player",
          hp: 15,
          maxHp: 15,
          statuses: [{ id: "s", name: "Prone", duration: 2 }],
          tempMods: [{ id: "m", stat: "AGI", val: -2, duration: 3, label: "slowed" }],
        }),
      ],
    });
    const out = formatStatusPost(s);
    expect(out).toContain("Prone 2r");
    expect(out).toContain("AGI -2");
  });

  it("omits a section that has no combatants", () => {
    const s = encounter({ combatants: [makeCombatant({ name: "Solo", role: "Player" })] });
    expect(formatStatusPost(s)).not.toContain("ENEMIES");
  });
});

describe("pending list", () => {
  it("lists players who have not acted during the player phase", () => {
    const s = encounter({
      phase: 0,
      combatants: [
        makeCombatant({ name: "Kada", role: "Player", done: true }),
        makeCombatant({ name: "Dawn", role: "Player", done: false }),
        makeCombatant({ name: "Meora", role: "Player", done: false }),
        makeCombatant({ name: "Horde", role: "Enemy", done: false }),
      ],
    });
    expect(pendingCombatants(s).map((c) => c.name)).toEqual(["Dawn", "Meora"]);
  });

  it("switches to enemies during the enemy phase", () => {
    const s = encounter({
      phase: 1,
      combatants: [
        makeCombatant({ name: "Kada", role: "Player", done: false }),
        makeCombatant({ name: "Horde", role: "Enemy", done: false }),
      ],
    });
    expect(pendingCombatants(s).map((c) => c.name)).toEqual(["Horde"]);
  });

  it("excludes downed combatants — they are out, not pending", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Fallen", role: "Player", hp: 0, done: false }),
        makeCombatant({ name: "Standing", role: "Player", done: false }),
      ],
    });
    expect(pendingCombatants(s).map((c) => c.name)).toEqual(["Standing"]);
  });

  it("mentions player handles where known and falls back to the name", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Dawn", role: "Player", player: "Luce Tosho" }),
        makeCombatant({ name: "Aulbaux", role: "Player", player: "@Naritaulb" }),
        makeCombatant({ name: "Nameless", role: "Player" }),
      ],
    });
    expect(formatPendingPost(s)).toBe("Pending — @Luce Tosho @Naritaulb Nameless");
  });

  it("says so when everyone has acted", () => {
    const s = encounter({
      combatants: [makeCombatant({ name: "Kada", role: "Player", done: true })],
    });
    expect(formatPendingPost(s)).toBe("All combatants have acted.");
  });
});

describe("enemy phase roll block", () => {
  it("emits the format the rules specify", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ id: "e1", name: "Void Horde 1", role: "Enemy", stats: stats({ DEX: 1 }) }),
        makeCombatant({ id: "e2", name: "Void Lancer", role: "Enemy", stats: stats({ DEX: 2 }) }),
      ],
    });
    const out = formatEnemyPhaseBlock(s, [
      { combatantId: "e1", target: "Kada" },
      { combatantId: "e2", target: "Seika" },
    ]);
    expect(out).toBe(
      "VOID HORDE 1 — Kada\n{{1d20+2}}\n\nVOID LANCER — Seika\n{{1d20+4}}",
    );
  });

  it("omits a zero bonus rather than printing +0", () => {
    const s = encounter({
      combatants: [makeCombatant({ id: "e", name: "Bloat", role: "Enemy", stats: stats() })],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Kada" }])).toBe(
      "BLOAT — Kada\n{{1d20}}",
    );
  });

  it("prints a negative bonus", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ id: "e", name: "Colossus", role: "Enemy", stats: stats({ DEX: -1 }) }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Aulbaux" }])).toBe(
      "COLOSSUS — Aulbaux\n{{1d20-2}}",
    );
  });

  it("folds temporary modifiers into the hit bonus", () => {
    const s = encounter({
      combatants: [
        makeCombatant({
          id: "e",
          name: "Horde",
          role: "Enemy",
          stats: stats({ DEX: 1 }),
          tempMods: [{ id: "m", stat: "DEX", val: -2, duration: 2, label: "blinded" }],
        }),
      ],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "Kada" }])).toBe(
      "HORDE — Kada\n{{1d20-2}}",
    );
  });

  it("skips dead enemies", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ id: "dead", name: "Gone", role: "Enemy", hp: 0 }),
        makeCombatant({ id: "alive", name: "Here", role: "Enemy", stats: stats() }),
      ],
    });
    const out = formatEnemyPhaseBlock(s, [
      { combatantId: "dead", target: "Kada" },
      { combatantId: "alive", target: "Kada" },
    ]);
    expect(out).not.toContain("GONE");
    expect(out).toContain("HERE");
  });

  it("marks an unassigned target rather than emitting a broken line", () => {
    const s = encounter({
      combatants: [makeCombatant({ id: "e", name: "Horde", role: "Enemy", stats: stats() })],
    });
    expect(formatEnemyPhaseBlock(s, [{ combatantId: "e", target: "  " }])).toBe(
      "HORDE — —\n{{1d20}}",
    );
  });
});

describe("target rolling", () => {
  it("only ever targets living players", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Alive", role: "Player", hp: 10, position: "Front" }),
        makeCombatant({ name: "Downed", role: "Player", hp: 0 }),
        makeCombatant({ id: "e1", name: "A", role: "Enemy" }),
        makeCombatant({ id: "e2", name: "B", role: "Enemy" }),
      ],
    });
    const rolls = rollTargets(s, seededRng(5));
    expect(rolls).toHaveLength(2);
    for (const r of rolls) expect(r.target).toBe("Alive");
  });

  it("weights the Front more heavily than the Back", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "FrontLiner", role: "Player", position: "Front" }),
        makeCombatant({ name: "BackLiner", role: "Player", position: "Back" }),
        ...Array.from({ length: 400 }, (_, i) =>
          makeCombatant({ id: `e${i}`, name: `E${i}`, role: "Enemy" }),
        ),
      ],
    });
    const rolls = rollTargets(s, seededRng(11));
    const front = rolls.filter((r) => r.target === "FrontLiner").length;
    const back = rolls.filter((r) => r.target === "BackLiner").length;
    expect(front).toBeGreaterThan(back);
  });

  it("does not crash when the whole party is down", () => {
    const s = encounter({
      combatants: [
        makeCombatant({ name: "Downed", role: "Player", hp: 0 }),
        makeCombatant({ id: "e", name: "Horde", role: "Enemy" }),
      ],
    });
    expect(rollTargets(s, seededRng(3))).toEqual([{ combatantId: "e", target: "" }]);
  });
});
