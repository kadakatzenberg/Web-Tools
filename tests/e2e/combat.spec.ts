import { test, expect, type Page } from "@playwright/test";

/**
 * Browser tests for the core live-combat workflows, run against the production
 * build. Network access to Supabase is not assumed — the library and generator
 * must degrade to a visible error rather than crashing.
 */

/** Add a combatant through the manual form. */
async function addCombatant(
  page: Page,
  name: string,
  opts: { role?: "Player" | "Enemy"; hp?: number; stats?: Partial<Record<string, number>> } = {},
) {
  const add = page.getByRole("button", { name: "Add a combatant" });
  if ((await add.getAttribute("aria-expanded")) === "false") await add.click();

  await page.getByLabel("Combatant name").fill(name);
  await page.getByLabel("Side").selectOption(opts.role ?? "Player");
  if (opts.hp != null) await page.getByLabel("Maximum hit points").fill(String(opts.hp));

  if (opts.stats) {
    const statsToggle = page.getByRole("button", { name: "Starting stats" });
    if ((await statsToggle.getAttribute("aria-expanded")) === "false") await statsToggle.click();
    for (const [k, v] of Object.entries(opts.stats)) {
      await page.locator(`.addform__stat:has(span:text-is("${k}")) input`).fill(String(v));
    }
  }

  await page.locator(".addform").getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

function card(page: Page, name: string) {
  return page.locator(".card").filter({ has: page.getByRole("button", { name, exact: true }) });
}

/**
 * The condition chips on a card. Scoped deliberately: a bare text match inside
 * the card also hits the `<option>` of that card's own condition picker.
 */
function conditions(page: Page, name: string) {
  return card(page, name).getByLabel(`${name} conditions`);
}

async function hpOf(page: Page, name: string): Promise<string> {
  return (await card(page, name).locator(".card__hp").first().innerText()).replace(/\s/g, "");
}

test.beforeEach(async ({ page }) => {
  // Clear once per test, not on every navigation — the reload-recovery test
  // needs the backup written by its first load to survive into the second.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__hm_cleared")) {
      localStorage.clear();
      sessionStorage.setItem("__hm_cleared", "1");
    }
  });
  await page.goto("/");
});

test("loads straight into a usable tracker", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Player Phase", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next phase" })).toBeVisible();
  await expect(page.getByText("The table is empty")).toBeVisible();
});

test("applies each damage type through resistance correctly", async ({ page }) => {
  await addCombatant(page, "Warden", { hp: 30, stats: { CON: 3, WIS: 2 } });
  const c = card(page, "Warden");

  // Physical: 10 - CON 3 = 7
  await c.getByLabel("Damage to Warden").fill("10");
  await c.getByLabel("Damage type").selectOption("physical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Warden")).toBe("23/30");

  // Magical: 10 - WIS 2 = 8
  await c.getByLabel("Damage to Warden").fill("10");
  await c.getByLabel("Damage type").selectOption("magical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Warden")).toBe("15/30");

  // True: ignores resistance entirely
  await c.getByLabel("Damage to Warden").fill("10");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Warden")).toBe("5/30");
});

test("routes damage through temporary shields, then shield, then HP", async ({ page }) => {
  await addCombatant(page, "Bulwark", { hp: 20 });
  const c = card(page, "Bulwark");

  await c.getByLabel("Increase shield").click();
  await c.getByLabel("Increase shield").click();
  await c.getByLabel("Increase shield").click();

  await c.getByLabel("Temporary shield value").fill("4");
  await c.getByRole("button", { name: "Ward", exact: true }).click();
  await expect(c.getByText("◈ 4")).toBeVisible();

  // 10 true damage: 4 temp, 3 shield, 3 to HP
  await c.getByLabel("Damage to Bulwark").fill("10");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();

  expect(await hpOf(page, "Bulwark")).toBe("17/20");
  await expect(c.locator(".shields__val")).toHaveText("0");
  await expect(c.getByText("◈ 4")).toHaveCount(0);
});

test("clamps healing at maximum and shows the wounded band", async ({ page }) => {
  await addCombatant(page, "Mender", { hp: 20 });
  const c = card(page, "Mender");

  await c.getByLabel("Damage to Mender").fill("14");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Mender")).toBe("6/20"); // 30% → Wounded band
  await expect(c.getByText("Wounded")).toBeVisible();

  await c.getByLabel("Heal Mender").fill("100");
  await c.getByRole("button", { name: "Mend", exact: true }).click();
  expect(await hpOf(page, "Mender")).toBe("20/20");
  await expect(c.getByText("Wounded")).toHaveCount(0);
});

test("marks a downed combatant unconscious without going negative", async ({ page }) => {
  await addCombatant(page, "Doomed", { hp: 10 });
  const c = card(page, "Doomed");
  await c.getByLabel("Damage to Doomed").fill("999");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Doomed")).toBe("0/10");
  await expect(c.getByText("Unconscious")).toBeVisible();
});

test("resolves initiative with players first and with enemies first", async ({ page }) => {
  await addCombatant(page, "Hero");
  await addCombatant(page, "Brute", { role: "Enemy" });

  await page.getByLabel("Number of d20s to roll").fill("1");
  await page.getByRole("button", { name: /^Roll/ }).click();

  const total = parseInt(
    (await page.locator(".initiative__total strong").innerText()).trim(),
    10,
  );

  // Beat the enemy total → players act first.
  await page.getByLabel("Player initiative total").fill(String(total + 1));
  await page.getByRole("button", { name: "Lock initiative" }).click();
  await expect(page.getByRole("heading", { name: "Player Phase", exact: true })).toBeVisible();
  await expect(page.getByText(/P1/)).toBeVisible();

  // Reset and tie → enemies act first.
  await page.getByRole("button", { name: "Reset init" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Number of d20s to roll").fill("1");
  await page.getByRole("button", { name: /^Roll/ }).click();
  const total2 = parseInt((await page.locator(".initiative__total strong").innerText()).trim(), 10);
  await page.getByLabel("Player initiative total").fill(String(total2));
  await page.getByRole("button", { name: "Lock initiative" }).click();
  await expect(page.getByRole("heading", { name: "Enemy Phase", exact: true })).toBeVisible();
});

test("advances phases and only ticks durations on the round boundary", async ({ page }) => {
  await addCombatant(page, "Ticker", { hp: 20 });
  const c = card(page, "Ticker");

  // A 2-round condition.
  await c.getByLabel("Condition", { exact: true }).selectOption("Stunned");
  await c.getByLabel("Condition duration in rounds").fill("2");
  await c.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(c.getByText("2r")).toBeVisible();

  const next = page.getByRole("button", { name: "Next phase" });

  // Player → Enemy: no tick.
  await next.click();
  await expect(page.getByRole("heading", { name: "Enemy Phase", exact: true })).toBeVisible();
  await expect(c.getByText("2r")).toBeVisible();

  // Enemy → Environment: no tick.
  await next.click();
  await expect(page.getByRole("heading", { name: "Environment Phase", exact: true })).toBeVisible();
  await expect(c.getByText("2r")).toBeVisible();

  // Environment → Player: round increments and the condition ticks.
  await next.click();
  await expect(page.getByRole("heading", { name: "Player Phase", exact: true })).toBeVisible();
  await expect(page.locator(".phasebar__round-value")).toHaveText("2");
  await expect(c.getByText("1r")).toBeVisible();

  // One more full round expires it.
  await next.click();
  await next.click();
  await next.click();
  await expect(c.getByText("1r")).toHaveCount(0);
});

test("applies damage over time and regeneration on the round boundary", async ({ page }) => {
  await addCombatant(page, "Burning", { hp: 20 });
  const c = card(page, "Burning");

  await c.getByRole("button", { name: "Effects" }).click();
  await c.getByLabel("DoT name").fill("Bleed");
  await c.getByLabel("DoT damage per round").fill("4");
  await c.getByLabel("DoT damage type").selectOption("true");
  await c.locator(".ongoing__set", { hasText: "Damage over time" }).getByLabel("Permanent").check();
  await c.locator(".ongoing__set", { hasText: "Damage over time" }).getByRole("button", { name: "Add" }).click();
  await expect(c.getByText("Bleed")).toBeVisible();

  const next = page.getByRole("button", { name: "Next phase" });
  await next.click();
  await next.click();
  await next.click();

  expect(await hpOf(page, "Burning")).toBe("16/20");
});

test("drives a cooldown ability through use and recovery", async ({ page }) => {
  await addCombatant(page, "Striker");
  const c = card(page, "Striker");

  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Cleave");
  await c.getByLabel("Ability mode").selectOption("cooldown");
  await c.getByLabel("Capacity or cooldown").fill("2");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Cleave" });
  await expect(ability.locator(".ability__state")).toHaveText("Ready");

  await ability.getByRole("button", { name: "Use", exact: true }).click();
  // Readiness is reported in Next Phase presses, not rounds. A 2-round
  // cooldown started at the top of a round is six presses away, and the count
  // has to move on every one of them or the control looks broken.
  await expect(ability.locator(".ability__state")).toHaveText("Ready in 6 phases");
  await expect(c.locator(".badge", { hasText: "Acted" })).toBeVisible();

  const next = page.getByRole("button", { name: "Next phase" });
  await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready in 5 phases");
  for (let i = 0; i < 2; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready in 3 phases");
  for (let i = 0; i < 2; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready next phase");
  await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready");
});

test("drives ammo and charge abilities", async ({ page }) => {
  await addCombatant(page, "Gunner");
  const c = card(page, "Gunner");
  await c.getByRole("button", { name: "Skills" }).click();

  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Volley");
  await c.getByLabel("Ability mode").selectOption("ammo");
  await c.getByLabel("Capacity or cooldown").fill("2");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const volley = c.locator(".ability").filter({ hasText: "Volley" });
  await expect(volley.locator(".ability__state")).toHaveText("2/2");
  await volley.getByRole("button", { name: "Fire", exact: true }).click();
  await expect(volley.locator(".ability__state")).toHaveText("1/2");
  await volley.getByRole("button", { name: "Fire", exact: true }).click();
  // Ammo does not refill in this system, so an empty clip reads as spent.
  await expect(volley.locator(".ability__state")).toHaveText("Spent");
  await expect(volley.getByRole("button", { name: "Fire", exact: true })).toBeDisabled();

  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Focus");
  await c.getByLabel("Ability mode").selectOption("charge");
  await c.getByLabel("Capacity or cooldown").fill("2");
  await c.getByLabel("Charge per round").fill("1");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const focus = c.locator(".ability").filter({ hasText: "Focus" });
  await focus.getByRole("button", { name: "Charge", exact: true }).click();
  // A charge announces when it lands rather than sitting on a counter that
  // does not move until the round turns over.
  await expect(focus.locator(".ability__state")).toHaveText("Ready in 6 phases");

  const next = page.getByRole("button", { name: "Next phase" });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(focus.locator(".ability__state")).toHaveText("Ready in 3 phases");
  for (let i = 0; i < 3; i++) await next.click();
  await expect(focus.locator(".ability__state")).toHaveText("2/2");
  await expect(focus.getByRole("button", { name: "Fire", exact: true })).toBeEnabled();
});

test("honours a phase lock", async ({ page }) => {
  await addCombatant(page, "Latecomer");
  const c = card(page, "Latecomer");
  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Awakening");
  await c.getByLabel("Phase lock").fill("2");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Awakening" });
  // A lock says when it opens rather than merely that it is shut.
  await expect(ability.locator(".ability__state")).toHaveText("Opens in 6 phases");

  // Lock initiative to seed the player phase counter, then complete a round.
  await page.getByLabel("Number of d20s to roll").fill("1");
  await page.getByRole("button", { name: /^Roll/ }).click();
  await page.getByLabel("Player initiative total").fill("999");
  await page.getByRole("button", { name: "Lock initiative" }).click();

  const next = page.getByRole("button", { name: "Next phase" });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready");
});

test("applies multi-target damage and healing", async ({ page }) => {
  await addCombatant(page, "Alpha", { hp: 20 });
  await addCombatant(page, "Beta", { hp: 20 });

  await page.getByRole("button", { name: "Multi-strike" }).click();
  await page.locator(".multi").getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Untaxed damage to apply").fill("5");
  await page.getByLabel("Damage type to apply").selectOption("raw");
  await page.getByRole("button", { name: /Apply to 2/ }).click();

  expect(await hpOf(page, "Alpha")).toBe("15/20");
  expect(await hpOf(page, "Beta")).toBe("15/20");

  await page.getByRole("button", { name: "Multi-mend" }).click();
  await page.locator(".multi").getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Healing amount to apply").fill("3");
  await page.getByRole("button", { name: /Apply to 2/ }).click();

  expect(await hpOf(page, "Alpha")).toBe("18/20");
});

test("undoes and redoes a damaging action", async ({ page }) => {
  await addCombatant(page, "Reversible", { hp: 20 });
  const c = card(page, "Reversible");

  await c.getByLabel("Damage to Reversible").fill("7");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Reversible")).toBe("13/20");

  await page.getByRole("button", { name: "Undo last action" }).click();
  expect(await hpOf(page, "Reversible")).toBe("20/20");

  await page.getByRole("button", { name: "Redo" }).click();
  expect(await hpOf(page, "Reversible")).toBe("13/20");
});

test("restores a removed combatant", async ({ page }) => {
  await addCombatant(page, "Fleeting");
  const title = page.locator(".card__name", { hasText: "Fleeting" });

  await card(page, "Fleeting").getByRole("button", { name: "Remove Fleeting" }).click();
  await expect(title).toHaveCount(0);

  await page.getByRole("button", { name: "Restore Fleeting" }).click();
  await expect(title).toBeVisible();
});

test("moves a combatant between battlefield positions", async ({ page }) => {
  await addCombatant(page, "Scout");
  const c = card(page, "Scout");

  await c.getByRole("button", { name: "Back", exact: true }).click();
  await expect(c.getByRole("button", { name: "Back", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The war table reflects the move. It starts folded on narrow viewports.
  const table = page.locator(".wartable");
  const expand = table.getByRole("button", { name: "Expand" });
  if (await expand.isVisible()) await expand.click();
  await expect(table.locator('.band[data-drop="Player:Back"] .tok')).toHaveCount(1);
});

test("opens the command palette and advances the phase from it", async ({ page }) => {
  await addCombatant(page, "Anyone");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();

  await page.getByLabel("Search commands").fill("advance");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Enemy Phase", exact: true })).toBeVisible();
});

test("records actions in the combat log", async ({ page }) => {
  await addCombatant(page, "Logged", { hp: 20 });
  const c = card(page, "Logged");
  await c.getByLabel("Damage to Logged").fill("6");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();

  await page.getByRole("button", { name: "Combat log", exact: true }).click();
  const log = page.getByRole("complementary", { name: "Combat log" });
  await expect(log.getByText(/Logged took 6 raw/)).toBeVisible();
});

test("advances the phase with the space bar", async ({ page }) => {
  await page.locator("body").click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Enemy Phase", exact: true })).toBeVisible();
});

test("survives a reload by offering the local backup", async ({ page }) => {
  await addCombatant(page, "Persistent", { hp: 20 });
  await page.waitForTimeout(150);
  await page.reload();

  await expect(page.getByText(/unsaved encounter with 1 combatants/)).toBeVisible();
  await page.getByRole("button", { name: "Restore it" }).click();
  await expect(page.getByRole("button", { name: "Persistent", exact: true })).toBeVisible();
});

test("keeps the library and generator usable when the backend is unreachable", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.abort());

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Combat library" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByRole("button", { name: "Generator" }).click();
  await expect(page.getByRole("heading", { name: "Enemy generator" })).toBeVisible();
  // Generation is local and must still work without the skill library.
  await page.getByRole("button", { name: /Generate MOOK/ }).click();
  await expect(page.locator(".rolled")).toBeVisible();
});

test("generates enemies to tier and adds a batch to the tracker", async ({ page }) => {
  await page.route("**/rest/v1/combat_skills**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.getByRole("button", { name: "Generator" }).click();
  await page.getByRole("button", { name: "NORMAL" }).click();
  await page.getByRole("button", { name: /Generate NORMAL/ }).click();

  // Stat total must equal the tier contract of +5.
  const values = await page.locator(".rolled__stat strong").allInnerTexts();
  const total = values.reduce((a, v) => a + parseInt(v.replace("+", ""), 10), 0);
  expect(total).toBe(5);
  expect(values.some((v) => v.startsWith("-"))).toBe(true);

  await page.getByLabel("Quantity").fill("3");
  await page.getByRole("button", { name: /Add 3× to tracker/ }).click();

  await expect(page.locator(".card")).toHaveCount(3);
});

test("exports the encounter as JSON", async ({ page }) => {
  await addCombatant(page, "Exported");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("export");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toContain("hei-mao-encounter");
});

test("logs no console errors during a normal session", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await addCombatant(page, "Quiet", { hp: 20 });
  const c = card(page, "Quiet");
  await c.getByLabel("Damage to Quiet").fill("5");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  await page.getByRole("button", { name: "Next phase" }).click();
  await page.getByRole("button", { name: "Next phase" }).click();
  await page.getByRole("button", { name: "Next phase" }).click();

  expect(errors).toEqual([]);
});


test("drags a combatant between war table bands", async ({ page }) => {
  await addCombatant(page, "Runner");

  const table = page.locator(".wartable");
  const expand = table.getByRole("button", { name: "Expand" });
  if (await expand.isVisible()) await expand.click();

  const front = table.locator('.band[data-drop="Player:Front"]');
  const back = table.locator('.band[data-drop="Player:Back"]');
  await expect(front.locator(".tok")).toHaveCount(1);

  const token = front.locator(".tok").first();
  const from = await token.boundingBox();
  const to = await back.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  // Two moves: the first engages the drag, the second lands on the target.
  await page.mouse.move(from!.x + from!.width / 2 + 30, from!.y + from!.height / 2, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
  await expect(back).toHaveAttribute("data-over", "1");
  await page.mouse.up();

  await expect(back.locator(".tok")).toHaveCount(1);
  await expect(front.locator(".tok")).toHaveCount(0);
  await expect(card(page, "Runner").getByRole("button", { name: "Back", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});

test("does not allow dropping a combatant onto the opposing side", async ({ page }) => {
  await addCombatant(page, "Ally");
  await addCombatant(page, "Foe", { role: "Enemy" });

  const table = page.locator(".wartable");
  const expand = table.getByRole("button", { name: "Expand" });
  if (await expand.isVisible()) await expand.click();

  const playerFront = table.locator('.band[data-drop="Player:Front"]');
  const enemyFront = table.locator('.band[data-drop="Enemy:Front"]');

  const token = playerFront.locator(".tok").first();
  const from = await token.boundingBox();
  const to = await enemyFront.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 30, from!.y + from!.height / 2, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
  // The enemy band never advertises itself as a valid target.
  await expect(enemyFront).not.toHaveAttribute("data-accept", "1");
  await page.mouse.up();

  // Ally stayed put; Foe was not displaced.
  await expect(playerFront.locator(".tok")).toHaveCount(1);
  await expect(enemyFront.locator(".tok")).toHaveCount(1);
});

test("cancels a drag on Escape", async ({ page }) => {
  await addCombatant(page, "Skittish");
  const table = page.locator(".wartable");
  const expand = table.getByRole("button", { name: "Expand" });
  if (await expand.isVisible()) await expand.click();

  const front = table.locator('.band[data-drop="Player:Front"]');
  const back = table.locator('.band[data-drop="Player:Back"]');
  const from = await front.locator(".tok").first().boundingBox();
  const to = await back.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 30, from!.y + from!.height / 2, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(front.locator(".tok")).toHaveCount(1);
  await expect(back.locator(".tok")).toHaveCount(0);
});


test("casts a stack ability and marks the combatant as acted", async ({ page }) => {
  await addCombatant(page, "Spearman");
  const c = card(page, "Spearman");

  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Sangre Lanza");
  await c.getByLabel("Ability mode").selectOption("stack");
  await c.getByLabel("Capacity or cooldown").fill("5");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Sangre Lanza" });
  await expect(ability.locator(".ability__state")).toHaveText("0/5");

  // Build a couple of stacks by hand, as a player would.
  await ability.getByLabel("Increase Sangre Lanza").click();
  await ability.getByLabel("Increase Sangre Lanza").click();
  await expect(ability.locator(".ability__state")).toHaveText("2/5");

  // Cast spends the action without touching the stack count.
  await ability.getByRole("button", { name: "Cast", exact: true }).click();
  await expect(ability.locator(".ability__state")).toHaveText("2/5");
  await expect(c.locator(".badge", { hasText: "Acted" })).toBeVisible();

  // Reset still zeroes the stacks.
  await ability.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(ability.locator(".ability__state")).toHaveText("0/5");
});

test("builds an enemy phase roll block in the rules format", async ({ page }) => {
  await addCombatant(page, "Kada");
  await addCombatant(page, "Void Horde", { role: "Enemy", stats: { DEX: 2 } });

  // Enter the enemy phase.
  await page.getByRole("button", { name: "Next phase" }).click();
  await expect(page.getByRole("heading", { name: "Enemy Phase", exact: true })).toBeVisible();

  const panel = page.locator(".enemyphase");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("+4")).toBeVisible(); // DEX 2 × 2

  await panel.getByLabel("Target for Void Horde").selectOption("Kada");
  await expect(panel.locator(".enemyphase__preview")).toHaveText(
    "VOID HORDE — Kada\n{{1d20+4}}",
  );

  await expect(panel.getByRole("button", { name: /Copy 1 roll/ })).toBeEnabled();
});

test("the enemy phase panel only appears during the enemy phase", async ({ page }) => {
  await addCombatant(page, "Foe", { role: "Enemy" });
  await expect(page.locator(".enemyphase")).toHaveCount(0);

  await page.getByRole("button", { name: "Next phase" }).click();
  await expect(page.locator(".enemyphase")).toBeVisible();

  await page.getByRole("button", { name: "Next phase" }).click();
  await expect(page.locator(".enemyphase")).toHaveCount(0);
});

test("pending count agrees between the phase bar and the post button", async ({ page }) => {
  await addCombatant(page, "Alpha");
  await addCombatant(page, "Beta");
  await addCombatant(page, "Enemy One", { role: "Enemy" });

  // Player phase: two players owe an action, the enemy does not count.
  await expect(page.getByRole("button", { name: "Pending (2)" })).toBeVisible();
  await expect(page.getByText("2 still to act")).toBeVisible();

  await card(page, "Alpha").getByRole("button", { name: "Mark Alpha as acted" }).click();
  await expect(page.getByRole("button", { name: "Pending (1)" })).toBeVisible();
  await expect(page.getByText("1 still to act")).toBeVisible();
});


test("negative CON makes a combatant take extra physical damage", async ({ page }) => {
  await addCombatant(page, "Glasscannon", { hp: 20, stats: { CON: -2, WIS: -1 } });
  const c = card(page, "Glasscannon");

  // 6 physical against CON -2 lands for 8.
  await c.getByLabel("Damage to Glasscannon").fill("6");
  await c.getByLabel("Damage type").selectOption("physical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Glasscannon")).toBe("12/20");

  // 6 magical against WIS -1 lands for 7.
  await c.getByLabel("Damage to Glasscannon").fill("6");
  await c.getByLabel("Damage type").selectOption("magical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Glasscannon")).toBe("5/20");

  // True damage still bypasses the calculation entirely.
  await c.getByLabel("Damage to Glasscannon").fill("2");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Glasscannon")).toBe("3/20");

  // The combat log explains why the hits landed heavier.
  await page.getByRole("button", { name: "Combat log", exact: true }).click();
  const log = page.getByRole("complementary", { name: "Combat log" });
  await expect(log.getByText(/\+2 exposed/)).toBeVisible();
});


test("an enemy with Advantage rolls keep-highest in the phase block", async ({ page }) => {
  await addCombatant(page, "Kada");
  await addCombatant(page, "Void Horde", { role: "Enemy", stats: { DEX: 1 } });

  // Give the enemy Advantage.
  const foe = card(page, "Void Horde");
  await foe.getByLabel("Condition", { exact: true }).selectOption("Advantage");
  await foe.getByLabel("Condition duration in rounds").fill("2");
  await foe.getByRole("button", { name: "Apply", exact: true }).click();

  await page.getByRole("button", { name: "Next phase" }).click();
  const panel = page.locator(".enemyphase");
  await expect(panel.locator(".enemyphase__swing")).toHaveText("ADV");

  await panel.getByLabel("Target for Void Horde").selectOption("Kada");
  await expect(panel.locator(".enemyphase__preview")).toHaveText(
    "VOID HORDE — Kada [ADV]\n{{2d20kh1+2}}",
  );

  // Crit flags are opt-in and change only the notation, not the bonus.
  await panel.getByRole("button", { name: "Crit flags" }).click();
  await expect(panel.locator(".enemyphase__preview")).toHaveText(
    "VOID HORDE — Kada [ADV]\n{{2d20kh1cscf=1+2}}",
  );
});

test("targeting everyone adds a scatter die with a legend", async ({ page }) => {
  await addCombatant(page, "Kada");
  await addCombatant(page, "Dawn");
  await addCombatant(page, "Bloat", { role: "Enemy" });

  await page.getByRole("button", { name: "Next phase" }).click();
  const panel = page.locator(".enemyphase");
  await panel.getByLabel("Target for Bloat").selectOption("everyone");

  await expect(panel.locator(".enemyphase__preview")).toHaveText(
    "BLOAT — everyone\n{{1d20}}\n{{1d2}} — 1: Kada. 2: Dawn.",
  );
});

test("a combatant's attack roll accounts for Advantage", async ({ page }) => {
  await addCombatant(page, "Archer", { stats: { DEX: 3 } });
  const c = card(page, "Archer");

  // Plain: hit bonus of +6.
  await expect(c.getByRole("button", { name: /Attack roll/ })).toHaveAttribute(
    "title",
    /\{\{1d20cscf=1\+6\}\}/,
  );

  await c.getByLabel("Condition", { exact: true }).selectOption("Advantage");
  await c.getByLabel("Condition duration in rounds").fill("3");
  await c.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(c.locator(".badge", { hasText: "Advantage" })).toBeVisible();
  await expect(c.getByRole("button", { name: /Attack roll/ })).toHaveAttribute(
    "title",
    /\{\{2d20kh1cscf=1\+6\}\}/,
  );
});

test("an ability can carry its own dice notation", async ({ page }) => {
  await addCombatant(page, "Mage");
  const c = card(page, "Mage");

  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Blazing Star");
  await c.getByLabel("Dice notation").fill("1d4");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Blazing Star" });
  await expect(ability.locator(".ability__dice")).toHaveText("🎲 {{1d4}}");
});

test("rejects prose typed into the dice field", async ({ page }) => {
  await addCombatant(page, "Confused");
  const c = card(page, "Confused");

  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Vague Skill");
  await c.getByLabel("Dice notation").fill("roll a d4 please");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  // The ability is created, but no bogus roll button is attached.
  const ability = c.locator(".ability").filter({ hasText: "Vague Skill" });
  await expect(ability).toBeVisible();
  await expect(ability.locator(".ability__dice")).toHaveCount(0);
});


test("negative stats can be typed by hand", async ({ page }) => {
  const add = page.getByRole("button", { name: "Add a combatant" });
  if ((await add.getAttribute("aria-expanded")) === "false") await add.click();
  const stats = page.getByRole("button", { name: "Starting stats" });
  if ((await stats.getAttribute("aria-expanded")) === "false") await stats.click();

  // The field already shows 0, so this only works if focus selects it.
  const con = page.locator('.addform__stat:has(span:text-is("CON")) input');
  await con.click();
  await con.pressSequentially("-3");
  await expect(con).toHaveValue("-3");

  await page.getByLabel("Combatant name").fill("Fragile");
  await page.locator(".addform").getByRole("button", { name: "Add", exact: true }).click();

  // The negative actually reached the combatant: 5 physical lands for 8.
  const c = card(page, "Fragile");
  await c.getByLabel("Damage to Fragile").fill("5");
  await c.getByLabel("Damage type").selectOption("physical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Fragile")).toBe("7/15");
});

test("negative stats can be typed into a combatant's stat editor", async ({ page }) => {
  await addCombatant(page, "Editable");
  const c = card(page, "Editable");
  await c.getByRole("button", { name: "Stats" }).click();
  await c.getByRole("button", { name: "Edit stats" }).click();

  const wis = c.locator('.stat-edit__field:has(span:text-is("WIS")) input');
  await wis.click();
  await wis.pressSequentially("-2");
  await expect(wis).toHaveValue("-2");
  await c.getByRole("button", { name: "Save", exact: true }).click();

  await c.getByLabel("Damage to Editable").fill("4");
  await c.getByLabel("Damage type").selectOption("magical");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Editable")).toBe("9/15"); // 4 + 2 exposed
});

test("the command palette focuses the combatant you searched for", async ({ page }) => {
  await addCombatant(page, "Alpha");
  await addCombatant(page, "Zulu");

  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("Zulu");
  await page.keyboard.press("Enter");

  // The searched combatant is the one that receives focus — not simply the
  // first card on the page, which is what the old generic selector always hit.
  // Asserted on focus rather than on scroll position: the roster is a grid, so
  // centring Zulu also centres whoever shares its row.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active?.classList.contains("card__name")) return "not a card name";
        return active.textContent ?? "?";
      }),
    )
    .toBe("Zulu");

  // And it is scrolled into view rather than left off-screen.
  await expect(card(page, "Zulu")).toBeInViewport();
});

test("the combat log does not trap keyboard focus", async ({ page }) => {
  await addCombatant(page, "Someone");
  await page.getByRole("button", { name: "Combat log", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Combat log" })).toBeVisible();

  // Focus a control in the tracker while the drawer is open. A focus trap
  // would have bounced it back inside the drawer.
  await page.getByRole("button", { name: "Next phase" }).focus();
  await expect(page.getByRole("button", { name: "Next phase" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Combat log" })).toHaveCount(0);
});

test("max HP can be corrected after a combatant is created", async ({ page }) => {
  await addCombatant(page, "Boss", { role: "Enemy" });
  const c = card(page, "Boss");
  // Choosing Enemy defaults to the Normal tier, which is 10 HP.
  expect(await hpOf(page, "Boss")).toBe("10/10");

  await c.getByRole("button", { name: "Stats" }).click();
  const maxHp = c.getByLabel("Maximum hit points for Boss");
  await maxHp.click();
  await maxHp.pressSequentially("30");
  await expect(c.locator(".card__hp").first()).toContainText("30");
});

test("the add form's enemy tier and hit points agree", async ({ page }) => {
  const add = page.getByRole("button", { name: "Add a combatant" });
  if ((await add.getAttribute("aria-expanded")) === "false") await add.click();

  await page.getByLabel("Side").selectOption("Enemy");
  await expect(page.getByLabel("Enemy tier")).toHaveValue("Normal");
  await expect(page.getByLabel("Maximum hit points")).toHaveValue("10");

  await page.getByLabel("Enemy tier").selectOption("Boss");
  await expect(page.getByLabel("Maximum hit points")).toHaveValue("30");

  await page.getByLabel("Side").selectOption("Player");
  await expect(page.getByLabel("Maximum hit points")).toHaveValue("15");
});


test("applies a condition to several combatants at once", async ({ page }) => {
  await addCombatant(page, "Hound A", { role: "Enemy" });
  await addCombatant(page, "Hound B", { role: "Enemy" });
  await addCombatant(page, "Bystander");

  await page.getByRole("button", { name: "Multi-affect" }).click();
  await page.locator(".multi").getByRole("button", { name: "Enemies", exact: true }).click();
  await page.getByLabel("Condition to apply").selectOption("Bound");
  await page.getByLabel("Duration in rounds to apply").fill("2");
  await page.getByRole("button", { name: /Apply to 2/ }).click();

  await expect(conditions(page, "Hound A").getByText("Bound")).toBeVisible();
  await expect(conditions(page, "Hound B").getByText("Bound")).toBeVisible();
  await expect(conditions(page, "Bystander").getByText("Bound")).toHaveCount(0);
});

test("applies a damage-over-time to several combatants at once", async ({ page }) => {
  await addCombatant(page, "Hound A", { role: "Enemy" });
  await addCombatant(page, "Hound B", { role: "Enemy" });

  await page.getByRole("button", { name: "Multi-affect" }).click();
  await page.locator(".multi").getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Condition to apply").selectOption("Custom");
  await page.getByLabel("Custom condition name to apply").fill("Senka's Trick");
  await page.getByLabel("Duration in rounds to apply").fill("2");
  await page.getByLabel("Damage over time").check();
  await page.getByLabel("Damage per round to apply").fill("2");
  await page.getByLabel("Damage type to apply").selectOption("true");
  await page.getByRole("button", { name: /Apply to 2/ }).click();

  await expect(card(page, "Hound A").getByText("Senka's Trick")).toBeVisible();

  // It actually ticks on the round boundary.
  const next = page.getByRole("button", { name: "Next phase" });
  await next.click();
  await next.click();
  await next.click();
  expect(await hpOf(page, "Hound A")).toBe("8/10");
  expect(await hpOf(page, "Hound B")).toBe("8/10");
});

/* ── Regressions: clicks that used to do nothing at all ── */

test("an incomplete strike explains itself instead of doing nothing", async ({ page }) => {
  await addCombatant(page, "Alpha");

  // Strike with an empty amount used to return silently, which is
  // indistinguishable from the app having frozen.
  await card(page, "Alpha").getByRole("button", { name: "Strike", exact: true }).click();
  await expect(page.getByText(/Enter an untaxed damage amount/)).toBeVisible();
});

test("apply is inert, not misleading, with no targets selected", async ({ page }) => {
  await addCombatant(page, "Alpha");
  await page.getByRole("button", { name: "Multi-affect" }).click();
  await page.locator(".multi").getByRole("button", { name: "None", exact: true }).click();
  await expect(page.getByRole("button", { name: /Apply to 0/ })).toBeDisabled();
});

test("a condition applies without having to fill the duration in first", async ({ page }) => {
  await addCombatant(page, "Hound", { role: "Enemy" });

  // The duration defaults to one round; leaving it untouched used to make
  // Apply a no-op.
  const c = card(page, "Hound");
  await c.getByLabel("Condition", { exact: true }).selectOption("Bound");
  await c.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(conditions(page, "Hound").getByText("Bound")).toBeVisible();
});

test("removing a combatant drops it from an open multi-target selection", async ({ page }) => {
  await addCombatant(page, "Alpha", { hp: 20 });
  await addCombatant(page, "Beta", { hp: 20 });

  await page.getByRole("button", { name: "Multi-strike" }).click();
  await page.locator(".multi").getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: /Apply to 2/ })).toBeVisible();

  // Selection is held by id, so a removed combatant used to stay selected and
  // the count kept claiming two.
  await card(page, "Beta").getByRole("button", { name: "Remove Beta" }).click();
  await expect(page.getByRole("button", { name: /Apply to 1/ })).toBeVisible();

  await page.getByLabel("Untaxed damage to apply").fill("5");
  await page.getByLabel("Damage type to apply").selectOption("raw");
  await page.getByRole("button", { name: /Apply to 1/ }).click();
  expect(await hpOf(page, "Alpha")).toBe("15/20");
});

test("a temporary modifier accepts a negative value", async ({ page }) => {
  await addCombatant(page, "Alpha");
  const c = card(page, "Alpha");
  await c.getByRole("button", { name: "Effects" }).click();

  // type="number" reports a lone "-" as an empty string, so "-2" became "2"
  // and a debuff silently became a buff.
  await c.getByLabel("Modifier value").fill("-2");
  await expect(c.getByLabel("Modifier value")).toHaveValue("-2");
  await c.getByLabel("Modifier duration").fill("2");
  await c.locator(".ongoing__set").last().getByRole("button", { name: "Add" }).click();
  await expect(c.getByText("STR -2")).toBeVisible();
});

test("lowering max HP clamps current HP to the new maximum", async ({ page }) => {
  await addCombatant(page, "Alpha", { hp: 30 });
  const c = card(page, "Alpha");
  await c.getByRole("button", { name: "Stats" }).click();
  await c.getByLabel("Maximum hit points for Alpha").fill("10");
  expect(await hpOf(page, "Alpha")).toBe("10/10");
});

test("healing lifts a downed combatant back above zero", async ({ page }) => {
  await addCombatant(page, "Alpha", { hp: 10 });
  const c = card(page, "Alpha");
  await c.getByLabel(/^Untaxed damage to/).fill("50");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Alpha")).toBe("0/10");

  await c.getByLabel("Heal Alpha").fill("4");
  await c.getByRole("button", { name: "Mend", exact: true }).click();
  expect(await hpOf(page, "Alpha")).toBe("4/10");
});

/* ── Portraits ── */

test("shows a portrait where there is one and the rank mark where there is not", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const mk = (id: string, name: string, portrait?: string) => ({
      id,
      name,
      role: "Player",
      type: "",
      hp: 20,
      maxHp: 30,
      shield: 0,
      tempShields: [],
      dots: [],
      hpRegens: [],
      stats: { STR: 1, DEX: 1, INT: 0, WIS: 1, AGI: 1, CON: 1 },
      statuses: [],
      abilities: [],
      tempMods: [],
      position: "Front",
      notes: "",
      done: false,
      ...(portrait ? { portrait } : {}),
    });
    window.localStorage.setItem(
      "heimao.encounter.backup.v2",
      JSON.stringify({
        state: {
          // A real image, a URL that 404s, and no portrait at all.
          combatants: [
            mk("a", "Has Portrait", `${location.origin}/favicon.svg`),
            mk("b", "Broken Portrait", `${location.origin}/nope-not-here.png`),
            mk("c", "No Portrait"),
          ],
          phase: 0,
          round: 1,
          locked: true,
          playerPhaseCount: 0,
          enemyPhaseCount: 0,
        },
        savedAt: Date.now(),
        sessionCode: null,
      }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const emblem = (name: string) => card(page, name).locator(".card__emblem");

  await expect(emblem("Has Portrait").locator("img")).toBeVisible();

  // A dead link must fall back to the rank mark, not leave a broken-image glyph
  // sitting where the combatant's identity should be.
  await expect(emblem("Broken Portrait").locator("img")).toHaveCount(0);
  await expect(emblem("Broken Portrait").locator("svg")).toBeVisible();

  await expect(emblem("No Portrait").locator("img")).toHaveCount(0);
  await expect(emblem("No Portrait").locator("svg")).toBeVisible();
});

test("a portrait can be set and cleared by hand", async ({ page }) => {
  await addCombatant(page, "Stranger");
  const c = card(page, "Stranger");
  await c.getByRole("button", { name: "Stats" }).click();

  const field = c.getByLabel("Portrait URL for Stranger");
  await field.fill(`${new URL(page.url()).origin}/favicon.svg`);
  await expect(c.locator(".card__emblem img")).toBeVisible();

  await field.fill("");
  await expect(c.locator(".card__emblem img")).toHaveCount(0);
  await expect(c.locator(".card__emblem svg")).toBeVisible();
});

/* ── Mechanics the skill pool needs ── */

test("overheal becomes a ward instead of being discarded", async ({ page }) => {
  await addCombatant(page, "Mender", { hp: 20 });
  const c = card(page, "Mender");

  await c.getByLabel("Damage to Mender").fill("2");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Mender")).toBe("18/20");

  // 6 healing into 2 missing HP: 2 restored, 4 converted.
  await c.getByLabel("Heal Mender").fill("6");
  await c.getByRole("button", { name: "Mend", exact: true }).click();
  expect(await hpOf(page, "Mender")).toBe("20/20");
  await expect(c.locator(".chip--temp").getByText("◈ 4")).toBeVisible();
});

test("the overheal conversion can be switched off", async ({ page }) => {
  await addCombatant(page, "Plain", { hp: 20 });
  const c = card(page, "Plain");

  await c.getByLabel("Damage to Plain").fill("2");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();

  await c.getByRole("button", { name: /Overheal/ }).click();
  await c.getByLabel("Heal Plain").fill("6");
  await c.getByRole("button", { name: "Mend", exact: true }).click();
  expect(await hpOf(page, "Plain")).toBe("20/20");
  await expect(c.locator(".chip--temp")).toHaveCount(0);
});

test("a vulnerability stack raises the damage its carrier takes", async ({ page }) => {
  await addCombatant(page, "Exposed", { role: "Enemy", hp: 30 });
  const c = card(page, "Exposed");

  await c.getByRole("button", { name: "Effects" }).click();
  await c.getByLabel("Stack name").fill("Vulnerability");
  await c.getByLabel("Stack ceiling").fill("4");
  await c.getByLabel("Damage taken per stack").fill("1");
  await c.locator(".ongoing__set").filter({ hasText: "Stacks" }).getByRole("button", { name: "Apply" }).click();
  await c.getByRole("button", { name: /Add a Vulnerability stack/ }).click();

  await expect(c.getByText("Vulnerability")).toBeVisible();

  // 5 raw with two stacks at +1 each = 7.
  await c.getByLabel("Damage to Exposed").fill("5");
  await c.getByLabel("Damage type", { exact: true }).selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Exposed")).toBe("23/30");
});

test("a flat damage-taken modifier is separate from CON", async ({ page }) => {
  await addCombatant(page, "Guarded", { role: "Enemy", hp: 30 });
  const c = card(page, "Guarded");

  await c.getByRole("button", { name: "Effects" }).click();
  await c.getByLabel("Modifier stat").selectOption("dmgTaken");
  await c.getByLabel("Modifier value").fill("-1");
  await c.getByLabel("Modifier duration").fill("2");
  await c.locator(".ongoing__set").filter({ hasText: "Temporary modifiers" }).getByRole("button", { name: "Add" }).click();

  await c.getByLabel("Damage to Guarded").fill("6");
  await c.getByLabel("Damage type", { exact: true }).selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Guarded")).toBe("25/30");
});

test("a stat check is built with the combatant's own modifier", async ({ page }) => {
  await addCombatant(page, "Saver", { stats: { CON: 3 } });
  const c = card(page, "Saver");

  await c.getByLabel("Check difficulty for Saver").fill("12");
  await c.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText(/CON DC 12 copied/)).toBeVisible();
});

test("a covered combatant's hits land on whoever is covering", async ({ page }) => {
  await addCombatant(page, "Guardian", { hp: 30 });
  await addCombatant(page, "Protected", { hp: 30 });

  await card(page, "Protected").getByLabel("Hits land on").selectOption({ label: "Guardian" });

  await card(page, "Protected").getByLabel("Damage to Protected").fill("6");
  await card(page, "Protected").getByLabel("Damage type", { exact: true }).selectOption("raw");
  await card(page, "Protected").getByRole("button", { name: "Strike", exact: true }).click();

  expect(await hpOf(page, "Protected")).toBe("30/30");
  expect(await hpOf(page, "Guardian")).toBe("24/30");
});

test("an armed reaction is raised when its trigger fires", async ({ page }) => {
  await addCombatant(page, "Countering", { role: "Enemy", hp: 30 });
  const c = card(page, "Countering");

  await c.getByRole("button", { name: "Skills" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Counter Hit");
  await c.getByLabel("Ability mode").selectOption("reaction");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  await c.getByRole("button", { name: /Edit Counter Hit/ }).click();
  await page.getByLabel("Fires when").selectOption("hit");
  await page.getByRole("button", { name: "Save" }).click();

  // Nothing armed until something happens.
  await expect(page.locator(".reaction")).toHaveCount(0);

  await c.getByLabel("Damage to Countering").fill("4");
  await c.getByLabel("Damage type", { exact: true }).selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();

  const strip = page.locator(".reaction");
  await expect(strip).toBeVisible();
  await expect(strip.getByText("Counter Hit")).toBeVisible();

  // Firing it spends the reaction, so it stops being armed.
  await strip.getByRole("button", { name: "Fire" }).click();
  await expect(page.locator(".reaction")).toHaveCount(0);
});

test("lifesteal heals the drain target for the damage that landed", async ({ page }) => {
  await addCombatant(page, "Drinker", { hp: 30 });
  await addCombatant(page, "Victim", { role: "Enemy", hp: 30 });

  // Hurt the drinker so the heal has somewhere to go.
  await card(page, "Drinker").getByLabel("Damage to Drinker").fill("10");
  await card(page, "Drinker").getByLabel("Damage type", { exact: true }).selectOption("raw");
  await card(page, "Drinker").getByRole("button", { name: "Strike", exact: true }).click();
  expect(await hpOf(page, "Drinker")).toBe("20/30");

  const v = card(page, "Victim");
  await v.getByLabel("Drain damage from Victim to").selectOption({ label: "⤺ Drinker" });
  await v.getByLabel("Damage to Victim").fill("8");
  await v.getByLabel("Damage type", { exact: true }).selectOption("raw");
  await v.getByRole("button", { name: "Strike", exact: true }).click();

  expect(await hpOf(page, "Victim")).toBe("22/30");
  expect(await hpOf(page, "Drinker")).toBe("28/30");
});

test("every waiting skill says when it will be usable", async ({ page }) => {
  await page.addInitScript(() => {
    const mk = (id: string, name: string, abilities: unknown[]) => ({
      id, name, role: "Player", type: "", hp: 20, maxHp: 20, shield: 0,
      tempShields: [], dots: [], hpRegens: [],
      stats: { STR: 1, DEX: 1, INT: 0, WIS: 1, AGI: 1, CON: 1 },
      statuses: [], abilities, tempMods: [], position: "Front", notes: "", done: false,
    });
    window.localStorage.setItem("heimao.encounter.backup.v2", JSON.stringify({
      state: {
        combatants: [
          mk("a", "Spent One", [{ id: "x", name: "Volley", mode: "ammo", max: 3, cur: 0 }]),
          mk("b", "Maxed One", [{ id: "y", name: "Fury", mode: "stack", max: 4, cur: 4 }]),
          mk("c", "Waiting One", [
            { id: "z", name: "Awakening", mode: "cooldown", max: 2, cur: 0,
              phaseLock: 3, phaseLockType: "player" },
          ]),
        ],
        phase: 0, round: 1, locked: true, playerPhaseCount: 1, enemyPhaseCount: 0,
      },
      savedAt: Date.now(), sessionCode: null,
    }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const state = async (name: string, skill: string) => {
    const c = card(page, name);
    await c.getByRole("button", { name: "Skills" }).click();
    return c.locator(".ability").filter({ hasText: skill }).locator(".ability__state").innerText();
  };

  // Ammo does not refill in this system, so an empty clip is spent, not low.
  expect(await state("Spent One", "Volley")).toBe("Spent");
  // Reaching the ceiling is the event a stack skill exists for.
  expect(await state("Maxed One", "Fury")).toBe("At max 4/4");
  // A lock must say when it opens, not merely that it is shut.
  expect(await state("Waiting One", "Awakening")).toBe("Opens in 6 phases");
});

test("a gated skill explains itself and readies when satisfied", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("heimao.encounter.backup.v2", JSON.stringify({
      state: {
        combatants: [{
          id: "d", name: "Dawn", role: "Player", type: "", hp: 20, maxHp: 20, shield: 0,
          tempShields: [], dots: [], hpRegens: [],
          stats: { STR: 2, DEX: 1, INT: 0, WIS: 1, AGI: 1, CON: 1 },
          statuses: [], tempMods: [], position: "Front", notes: "", done: false,
          abilities: [
            { id: "s1", name: "Sangre Lanza", mode: "stack", max: 4, cur: 2 },
            { id: "ult", name: "ULT: Sueno Imposible", mode: "charge", max: 1, cur: 0,
              requires: { skill: "Sangre Lanza", atMax: true } },
          ],
        }],
        phase: 0, round: 1, locked: true, playerPhaseCount: 1, enemyPhaseCount: 0,
      },
      savedAt: Date.now(), sessionCode: null,
    }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const c = card(page, "Dawn");
  await c.getByRole("button", { name: "Skills" }).click();
  const ult = c.locator(".ability").filter({ hasText: "Sueno Imposible" });

  await expect(ult.locator(".ability__state")).toHaveText("Gated");
  await expect(ult.getByText("Needs Sangre Lanza at 4/4 — currently 2")).toBeVisible();
  await expect(ult.getByRole("button", { name: "Fire", exact: true })).toHaveCount(0);

  // Filling the prerequisite readies it — no separate Charge press.
  const stack = c.locator(".ability").filter({ hasText: "Sangre Lanza" });
  await stack.getByLabel(/Increase/).click();
  await stack.getByLabel(/Increase/).click();

  await expect(ult.locator(".ability__state")).toHaveText("Ready");
  await expect(ult.getByRole("button", { name: "Fire", exact: true })).toBeEnabled();
});
