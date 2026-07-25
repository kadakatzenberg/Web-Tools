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
  await expect(page.getByRole("heading", { name: "Player Phase" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next phase →" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Player Phase" })).toBeVisible();
  await expect(page.getByText(/P1/)).toBeVisible();

  // Reset and tie → enemies act first.
  await page.getByRole("button", { name: "Reset init" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Number of d20s to roll").fill("1");
  await page.getByRole("button", { name: /^Roll/ }).click();
  const total2 = parseInt((await page.locator(".initiative__total strong").innerText()).trim(), 10);
  await page.getByLabel("Player initiative total").fill(String(total2));
  await page.getByRole("button", { name: "Lock initiative" }).click();
  await expect(page.getByRole("heading", { name: "Enemy Phase" })).toBeVisible();
});

test("advances phases and only ticks durations on the round boundary", async ({ page }) => {
  await addCombatant(page, "Ticker", { hp: 20 });
  const c = card(page, "Ticker");

  // A 2-round condition.
  await c.getByLabel("Condition", { exact: true }).selectOption("Stunned");
  await c.getByLabel("Condition duration in rounds").fill("2");
  await c.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(c.getByText("2r")).toBeVisible();

  const next = page.getByRole("button", { name: "Next phase →" });

  // Player → Enemy: no tick.
  await next.click();
  await expect(page.getByRole("heading", { name: "Enemy Phase" })).toBeVisible();
  await expect(c.getByText("2r")).toBeVisible();

  // Enemy → Environment: no tick.
  await next.click();
  await expect(page.getByRole("heading", { name: "Environment Phase" })).toBeVisible();
  await expect(c.getByText("2r")).toBeVisible();

  // Environment → Player: round increments and the condition ticks.
  await next.click();
  await expect(page.getByRole("heading", { name: "Player Phase" })).toBeVisible();
  await expect(page.getByText(/Round\s*2/)).toBeVisible();
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

  const next = page.getByRole("button", { name: "Next phase →" });
  await next.click();
  await next.click();
  await next.click();

  expect(await hpOf(page, "Burning")).toBe("16/20");
});

test("drives a cooldown ability through use and recovery", async ({ page }) => {
  await addCombatant(page, "Striker");
  const c = card(page, "Striker");

  await c.getByRole("button", { name: "Abilities" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Cleave");
  await c.getByLabel("Ability mode").selectOption("cooldown");
  await c.getByLabel("Capacity or cooldown").fill("2");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Cleave" });
  await expect(ability.locator(".ability__state")).toHaveText("Ready");

  await ability.getByRole("button", { name: "Use", exact: true }).click();
  await expect(ability.locator(".ability__state")).toHaveText("2 left");
  await expect(c.locator(".badge", { hasText: "Acted" })).toBeVisible();

  const next = page.getByRole("button", { name: "Next phase →" });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("1 left");
  for (let i = 0; i < 3; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready");
});

test("drives ammo and charge abilities", async ({ page }) => {
  await addCombatant(page, "Gunner");
  const c = card(page, "Gunner");
  await c.getByRole("button", { name: "Abilities" }).click();

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
  await expect(volley.locator(".ability__state")).toHaveText("0/2");
  await expect(volley.getByRole("button", { name: "Fire", exact: true })).toBeDisabled();

  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Focus");
  await c.getByLabel("Ability mode").selectOption("charge");
  await c.getByLabel("Capacity or cooldown").fill("2");
  await c.getByLabel("Charge per round").fill("1");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const focus = c.locator(".ability").filter({ hasText: "Focus" });
  await focus.getByRole("button", { name: "Charge", exact: true }).click();
  const next = page.getByRole("button", { name: "Next phase →" });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(focus.locator(".ability__state")).toHaveText("1/2");
  for (let i = 0; i < 3; i++) await next.click();
  await expect(focus.locator(".ability__state")).toHaveText("2/2");
  await expect(focus.getByRole("button", { name: "Fire", exact: true })).toBeEnabled();
});

test("honours a phase lock", async ({ page }) => {
  await addCombatant(page, "Latecomer");
  const c = card(page, "Latecomer");
  await c.getByRole("button", { name: "Abilities" }).click();
  await c.getByRole("button", { name: "+ Ability" }).click();
  await c.getByLabel("Ability name").fill("Awakening");
  await c.getByLabel("Phase lock").fill("2");
  await c.locator(".add-ability").getByRole("button", { name: "Add", exact: true }).click();

  const ability = c.locator(".ability").filter({ hasText: "Awakening" });
  await expect(ability.locator(".ability__state")).toHaveText("Locked");

  // Lock initiative to seed the player phase counter, then complete a round.
  await page.getByLabel("Number of d20s to roll").fill("1");
  await page.getByRole("button", { name: /^Roll/ }).click();
  await page.getByLabel("Player initiative total").fill("999");
  await page.getByRole("button", { name: "Lock initiative" }).click();

  const next = page.getByRole("button", { name: "Next phase →" });
  for (let i = 0; i < 3; i++) await next.click();
  await expect(ability.locator(".ability__state")).toHaveText("Ready");
});

test("applies multi-target damage and healing", async ({ page }) => {
  await addCombatant(page, "Alpha", { hp: 20 });
  await addCombatant(page, "Beta", { hp: 20 });

  await page.getByRole("button", { name: "Multi-strike" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Amount").fill("5");
  await page.getByLabel("Damage type").last().selectOption("raw");
  await page.getByRole("button", { name: /Apply to 2/ }).click();

  expect(await hpOf(page, "Alpha")).toBe("15/20");
  expect(await hpOf(page, "Beta")).toBe("15/20");

  await page.getByRole("button", { name: "Multi-mend" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Amount").fill("3");
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
  await expect(page.getByRole("heading", { name: "Enemy Phase" })).toBeVisible();
});

test("records actions in the combat log", async ({ page }) => {
  await addCombatant(page, "Logged", { hp: 20 });
  const c = card(page, "Logged");
  await c.getByLabel("Damage to Logged").fill("6");
  await c.getByLabel("Damage type").selectOption("raw");
  await c.getByRole("button", { name: "Strike", exact: true }).click();

  await page.getByRole("button", { name: "Log", exact: true }).click();
  const log = page.getByRole("complementary", { name: "Combat log" });
  await expect(log.getByText(/Logged took 6 raw/)).toBeVisible();
});

test("advances the phase with the space bar", async ({ page }) => {
  await page.locator("body").click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Enemy Phase" })).toBeVisible();
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
  await page.getByRole("button", { name: "Next phase →" }).click();
  await page.getByRole("button", { name: "Next phase →" }).click();
  await page.getByRole("button", { name: "Next phase →" }).click();

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
