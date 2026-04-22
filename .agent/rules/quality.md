# Code Quality Rules

These rules define the code style and quality standards for jarbris-widget.

## 1. Linting & Formatting

- **ESLint**: No code should be committed if 'npm run lint' fails.
- **Prettier**: Run 'npm run format' before committing.
- **Lint on touch**: Every file you modify MUST be linted before committing. Fix ALL errors and warnings in that file — not just the lines you changed. Leave every touched file at zero lint issues.
- **Knip**: Run 'npm run knip' periodically to detect unused exports, dead code, and orphan files. Address findings before they accumulate.

## 2. Imports

- **Order**: Organize imports: React first, then external libs, then internal modules, then styles.
- **ESM**: Use ES Modules exclusively ('import/export').
- **No Unused Imports**: Remove unused imports immediately. Do not leave them "for later".

## 3. DRY Principle & UI Consistency

- **Utils**: Generic helpers (color conversion, DOM helpers) MUST live in 'utils/'.
- **UI Atoms**: Re-use core building blocks (e.g., 'MessageBubble', 'Drawer') instead of duplicating CSS or structural HTML. This ensures project-wide visual consistency.
- **No Duplication**: If similar logic or styling appears in multiple components, extract it to a shared component, hook, or utility.
- **File size guardrail (500 LOC)**: If a source file exceeds 500 LOC, do NOT make it larger. Extract new code into a separate module. For files already over 500 LOC (e.g., `useChat.js`), full splits are tracked in the backlog — don't block feature work on them. New files MUST stay under 500 LOC.
- **localStorage**: All localStorage access MUST go through 'utils/storage.js'. Never call 'localStorage.getItem/setItem' directly in components or hooks. The storage helper handles try/catch for Safari private browsing and provides the 'jarbris_' prefix automatically.

## 4. Extensibility

- **Configuration over hardcoding**: When implementing a new hook or component, use configurable parameters (trigger types, timeouts, copy arrays, callbacks) instead of hardcoding values, when the cost delta is marginal.
- **No premature abstraction**: If making something generic requires significant extra architecture (providers, registries, plugin systems), implement the concrete case first. Generalize only when a second concrete use case emerges.
- **The test**: Ask "does making this configurable add more than 10% development time?" If no, make it configurable. If yes, hardcode and revisit later.

## 5. Comments & Documentation

- **Value-Driven**: Add comments only if they explain "why" something is done or provide non-obvious context. Avoid redundant comments that restate the code.
- **Tone**: Keep comments professional and technical. No emojis allowed in the codebase.
- **No Emojis**: **NEVER use emojis in code comments.** They are reserved for commit messages and UI feedback if necessary, but not the codebase.

## 6. Debugging & Logging

- **No debug console.error**: NEVER use 'console.error' as a debugging tool. These appear as red errors in production and mislead developers. Use devtools, breakpoints, or WDYR instead.
- **Legitimate console.error**: Only use 'console.error' for actual error handling in catch blocks where the error is meaningful to surface.
- **Dev-only tools**: The project includes 'why-did-you-render' (WDYR) for tracking unnecessary re-renders. It activates automatically in dev mode via 'src/wdyr.js'.
