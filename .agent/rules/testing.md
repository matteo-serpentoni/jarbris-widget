# Testing Rules

These rules define the unit-testing standard for jarbris-widget. The widget is ~72% UI / ~28% logic;
the policy is **risk-based coverage of the logic layer, NOT a global coverage percentage.** Chasing
100% on a UI-heavy project produces brittle DOM assertions (they break on refactors, not on bugs) and
is explicitly out of scope here.

## 1. Runner

- **Vitest** (`npm test` = `vitest run`, `npm run test:watch`). Config lives in `vite.config.js` under
  `test` (jsdom environment). No separate jest setup.
- **Test location**: `tests/unit/` with a **mirror path** of the source (e.g.
  `src/services/privacyApi.js` → `tests/unit/services/privacyApi.test.js`). Do NOT co-locate `.test`
  files inside `src/`.
- **Imports explicit**: `import { describe, it, expect, vi, beforeEach } from 'vitest'`. Mock modules
  with `vi.mock(path, factory)`; mock globals (`fetch`, `window.URL.createObjectURL`) with
  `vi.stubGlobal`. Always `vi.restoreAllMocks()` / `vi.unstubAllGlobals()` in `afterEach`.

## 2. Test on touch — the logic layer (mandatory)

When you **add or modify** code in the **logic layer**, you MUST add or update the corresponding unit
test in the same change — never leave new logic untested. The logic layer is defined by `state.md`:

- **`services/`** — API/contract layer (e.g. `privacyApi`, `chatApi`, `checkoutService`).
- **`hooks/`** — custom hooks holding complex state/flow (e.g. `useChat`, `useCheckout`, `useIdleNudge`).
- **`utils/`** — pure helpers (e.g. `messageHelpers`, `shopifyUtils`, `storage`, `validators`).
- **`contexts/`** — non-presentational state logic.

Cover the **happy path, the error/edge states, and any security-relevant behaviour** (error mapping,
token handling, anti-enumeration, normalization, cleanup). This is not optional and is part of the
task, not a follow-up.

Priority when paying down existing debt (highest first): **(1) security / PII / token** surface
(`privacyApi`, `widgetTokenStore`, `consentBridge`, consent calls) → **(2) high-risk stateful hooks**
(`useChat`, `useCheckout`, `useIdleNudge`) → **(3) pure utils**.

## 3. What NOT to unit-test

- **Presentational components** (`components/**`): do NOT unit-test render output by asserting on the
  DOM/JSX — brittle, low signal. Confidence in the UI comes from a few **integration tests**
  (testing-library) over the critical user journeys (privacy OTP flow, chat send/receive, checkout),
  and from **Playwright e2e post-BFS** — not from exhaustive component tests.
- Trivial pass-throughs, getters, and config objects.

## 4. Quality gates

- **Lint on touch** still applies (see `quality.md §1`): every touched file at zero lint issues.
- Run `npm test` (green) before pushing. The pre-commit hook runs lint-staged only; tests are a
  pre-push responsibility.
- A test that encodes a bug as expected behaviour is wrong — fix the code, not the test.
