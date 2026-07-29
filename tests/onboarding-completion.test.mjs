import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPLETION_RECOVERY_MS,
  runOnboardingCompletion,
} from "../lib/onboarding/completion-watchdog.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every registration type uses the reload-safe completion transition", async () => {
  const pages = await Promise.all([
    read("app/onboarding/profile/page.jsx"),
    read("app/onboarding/builder/portfolio/page.jsx"),
    read("app/onboarding/builder/studio/complete/page.jsx"),
    read("app/onboarding/studio/page.jsx"),
  ]);

  for (const page of pages) {
    assert.match(page, /runOnboardingCompletion\(\(\) =>/);
    assert.match(page, /navigateAfterOnboarding\(\{ router, updateProfile \}\)/);
    assert.doesNotMatch(page, /router\.(?:push|replace)\(STEPS\.complete\)/);
    assert.doesNotMatch(page, /refresh\?\.\(\)/);
  }
});

test("completion performs a base-aware document replace and updates the profile cache", async () => {
  const completion = await read("lib/onboarding/completion.js");

  assert.match(completion, /updateProfile\?\.\(\{\s*onboarding_completed_at:/);
  assert.match(completion, /window\.location\.replace\(withBase\(STEPS\.complete\)\)/);
  assert.match(completion, /router\?\.replace\(STEPS\.complete\)/);
});

test("a completion request that never settles automatically reloads the guarded step", async () => {
  const previousWindow = globalThis.window;
  let scheduledRecovery = null;
  let scheduledDelay = null;
  let clearedTimer = null;
  let reloadCount = 0;
  let settleOperation;

  globalThis.window = {
    setTimeout(callback, delay) {
      scheduledRecovery = callback;
      scheduledDelay = delay;
      return 42;
    },
    clearTimeout(timer) {
      clearedTimer = timer;
    },
    location: {
      reload() {
        reloadCount += 1;
      },
    },
  };

  try {
    const pending = runOnboardingCompletion(
      () => new Promise((resolve) => {
        settleOperation = resolve;
      })
    );

    assert.equal(scheduledDelay, COMPLETION_RECOVERY_MS);
    assert.equal(reloadCount, 0);
    scheduledRecovery();
    assert.equal(reloadCount, 1);

    settleOperation({ error: null });
    assert.deepEqual(await pending, { error: null });
    assert.equal(clearedTimer, 42);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
