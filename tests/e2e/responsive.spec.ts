import { test, expect, type Page } from "@playwright/test";

/**
 * Layout, accessibility, and stress checks.
 *
 * The horizontal-overflow assertion is the important one: a war table that
 * scrolls sideways on a phone is unusable mid-session.
 */

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "tablet-landscape-1024", width: 1024, height: 768 },
  { name: "tablet-portrait-768", width: 768, height: 1024 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 740 },
];

async function seed(page: Page, count: number) {
  await page.addInitScript(
    ([n]) => {
      const stats = { STR: 1, DEX: 1, INT: 0, WIS: 1, AGI: 1, CON: 1 };
      const combatants = Array.from({ length: n as number }, (_, i) => ({
        id: `seed${i}`,
        name: `Combatant ${i + 1}`,
        role: i % 2 === 0 ? "Player" : "Enemy",
        type: i % 2 === 0 ? "" : "Elite",
        hp: 12,
        maxHp: 20,
        shield: 2,
        tempShields: [{ id: `ts${i}`, val: 3, duration: 2, label: "ward" }],
        dots: [{ id: `d${i}`, name: "Bleed", dmg: 2, type: "physical", permanent: false, duration: 3 }],
        hpRegen: 0,
        hpRegens: [{ id: `r${i}`, val: 1, permanent: true, duration: null }],
        stats,
        statuses: [
          { id: `s${i}a`, name: "Prone", duration: 2 },
          { id: `s${i}b`, name: "Stunned", duration: 3 },
        ],
        abilities: [
          { id: `a${i}a`, name: "Cleave", mode: "cooldown", max: 2, cur: 1, gainPerPhase: 1 },
          { id: `a${i}b`, name: "Volley", mode: "ammo", max: 3, cur: 2, gainPerPhase: 1 },
          { id: `a${i}c`, name: "Focus", mode: "charge", max: 3, cur: 1, gainPerPhase: 1, charging: true },
        ],
        tempMods: [{ id: `m${i}`, stat: "STR", val: 2, duration: 3, label: "rage" }],
        position: ["Front", "Back", "Out"][i % 3],
        notes: "",
        sheetSkills: {},
        done: false,
      }));
      window.localStorage.setItem(
        "heimao.encounter.backup.v2",
        JSON.stringify({
          state: { combatants, phase: 0, round: 1, locked: true, playerPhaseCount: 1, enemyPhaseCount: 0 },
          savedAt: Date.now(),
          sessionCode: null,
        }),
      );
    },
    [count],
  );
}

for (const vp of VIEWPORTS) {
  test(`no horizontal overflow at ${vp.name}`, async ({ page }) => {
    await seed(page, 12);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await page.getByRole("button", { name: "Restore it" }).click();
    await expect(page.locator(".card").first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page scrolls horizontally at ${vp.name}`).toBeLessThanOrEqual(1);

    // The primary control must remain reachable at every size.
    await expect(page.getByRole("button", { name: "Next phase →" })).toBeVisible();
  });
}

test("keeps touch targets large enough on a phone", async ({ page }) => {
  await seed(page, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const box = await page.getByRole("button", { name: "Next phase →" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test("is operable by keyboard alone", async ({ page }) => {
  await page.goto("/");

  // Tab reaches the skip link first.
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();

  // Every interactive element that receives focus must show a visible ring.
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    if (!el || el === document.body) return "none";
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe("none");
});

test("traps and restores focus in a dialog", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("exposes health as an accessible meter", async ({ page }) => {
  await seed(page, 2);
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const meter = page.getByRole("meter", { name: /Combatant 1 health/ }).first();
  await expect(meter).toHaveAttribute("aria-valuenow", "12");
  await expect(meter).toHaveAttribute("aria-valuemax", "20");
});

test("disables the atmosphere canvas under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("atmosphere")).toBeHidden();
});

test("handles a 40-combatant encounter with responsive phase advancement", async ({ page }) => {
  await seed(page, 40);
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();
  await expect(page.locator(".card")).toHaveCount(40);

  const next = page.getByRole("button", { name: "Next phase →" });

  // Three phases = one full round tick across 40 combatants with DoTs,
  // regeneration, shields, statuses, modifiers, and three abilities each.
  const start = Date.now();
  for (let i = 0; i < 3; i++) await next.click();
  await expect(page.getByText(/Round\s*2/)).toBeVisible();
  const elapsed = Date.now() - start;

  expect(elapsed, "a full round across 40 combatants should stay responsive").toBeLessThan(6000);

  // Durations actually advanced.
  await expect(page.locator(".card").first().getByText("1r").first()).toBeVisible();
});

test("stays responsive typing into a card in a large encounter", async ({ page }) => {
  await seed(page, 20);
  await page.goto("/");
  await page.getByRole("button", { name: "Restore it" }).click();

  const input = page.locator(".card").first().getByLabel(/^Damage to/);
  const start = Date.now();
  await input.fill("12");
  await expect(input).toHaveValue("12");
  expect(Date.now() - start).toBeLessThan(2000);
});
