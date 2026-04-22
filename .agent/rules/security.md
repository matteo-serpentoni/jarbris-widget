# Widget Security Rules

These rules define the security standards specific to jarbris-widget, which runs as an embedded iframe on third-party merchant sites.

## 1. iframe Isolation

- **Origin validation**: All `postMessage` communication MUST validate the `event.origin` against the merchant's registered domain. Never accept messages from unknown origins.
- **Outbound targetOrigin**: When sending `postMessage` to the parent frame, NEVER use the wildcard `'*'` as `targetOrigin`. Use the merchant's known origin from `bridge.js` config (`ALLOWED_PARENT_ORIGINS`) or `event.origin` from the initial identity handshake. This prevents data leakage if the widget is embedded in an unauthorized page.
- **Message schema**: Incoming bridge messages must be validated against a known schema before processing. Reject any message with unexpected structure or types.
- **Sandbox awareness**: The widget iframe relies on specific sandbox permissions. Never assume capabilities (e.g., `allow-top-navigation`) that aren't explicitly granted.

## 2. XSS Prevention

- **No `dangerouslySetInnerHTML`**: Never render raw HTML from API responses or merchant configuration. If rich text is needed, use a sanitization library with a strict tag whitelist.
- **Exception**: `FormattedText` (`components/Message/FormattedText.jsx`) is the only authorized component to use `dangerouslySetInnerHTML`. It renders through `processMessage()` which escapes all HTML before converting safe markdown patterns (bold, italic, links, code). All other components MUST use `<FormattedText>` instead of calling `processMessage` or `dangerouslySetInnerHTML` directly.
- **User-generated content**: Chat messages from users are plain text. Always render them as text nodes, never as HTML. Use React's default escaping.
- **Merchant content**: Product descriptions from Shopify may contain HTML. Strip all tags before rendering in chat bubbles. Display only plain text content.

## 3. Data Storage

The widget runs on the merchant's domain. Under the **ePrivacy Directive**, localStorage access requires either:  
**(a) strict necessity** for a service explicitly requested by the user, or  
**(b) explicit prior consent** (opt-in).

### Permitted in localStorage (strictly necessary — no consent required)

These keys are permitted because without them the chat service cannot function as requested:

| Key | Reason |
|---|---|
| `jarbris_session_id` | Chat session continuity across page navigations |
| `jarbris_messages` | Restoring the conversation the user was actively having |
| `jarbris_session_time` | Detecting session timeout (functional, not tracking) |
| `jarbris_session_status` | Displaying correct UI state on return |
| `jarbris_profile` | Name/email **actively submitted by the user** via the profile form |

### Prohibited in localStorage

- **`jarbris_shopify_customer`** — PII (name, email, Shopify customer ID) received **passively** from the storefront via `postMessage`, without any user action. Must be stored **in React state (memory) only**. On page reload, the parent storefront re-sends it via `postMessage` immediately, so there is zero UX degradation.
- **Auth tokens / API secrets** — Never in localStorage under any circumstances.
- **Analytics/tracking data** — Must not be stored until the user has given **explicit consent**. Check consent via `/api/chat/consent` or `window.Shopify.customerPrivacy` before writing any tracking data.
- **Cookies** — The widget must not set any cookies on the merchant's domain.

### Cleanup on session expiry

When a session times out (30 min), all `jarbris_*` keys in `localStorage` MUST be removed. This is implemented in the `getOrCreateSessionId()` function in `useChat.js`.


## 4. CSP Compliance

- **No `eval()`**: The widget code must never use `eval()`, `new Function()`, or any pattern requiring `unsafe-eval` in the merchant's CSP.
- **Inline styles**: Prefer CSS classes and CSS-in-JS solutions that don't require `unsafe-inline` style CSP. If inline styles are unavoidable, keep them minimal.
- **External resources**: All external resources (fonts, images) must be loaded over HTTPS. Never reference HTTP resources.

## 5. Network Security

- **API base URL**: The API endpoint must come from the build-time configuration, never from the merchant's page or URL parameters.
- **No credentials leakage**: Never include merchant API keys, Shopify tokens, or backend credentials in the widget bundle. The widget authenticates via its own session mechanism.
- **Error messages**: Never display raw error messages from the API to the end user. Show generic friendly messages and log details to console in dev mode only.
