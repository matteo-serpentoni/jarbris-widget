# Jarbris Widget

Embeddable AI-powered chat widget for e-commerce websites. Renders as an iframe with a WebGL orb interface, glassmorphism UI, and real-time messaging via Socket.io.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Build | Vite 7 |
| Animation | Framer Motion 12 |
| WebGL | OGL |
| Real-time | Socket.io Client |
| Styling | Vanilla CSS (scoped, no Tailwind) |

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint on all source files |
| `npm run format` | Format code with Prettier |
| `npm run knip` | Detect unused exports, files, and dependencies |

## Project Structure

```
src/
├── main.jsx                 # Entry point
├── wdyr.js                  # Why Did You Render (dev-only)
├── App.jsx                  # Root component, routing
├── components/
│   ├── Orb/                 # WebGL orb + glassmorphism container
│   ├── Chat/                # Chat UI (MessageList, MessageBubble, InputBar)
│   ├── Message/             # Message types (ProductCards, OrderCards, DynamicForm)
│   ├── UI/                  # Shared UI atoms (Drawer, ErrorBoundary, ImageLightbox)
│   └── Dev/                 # Dev-only tools (DevTools, MockStorefront)
├── hooks/
│   ├── useChat.js           # Chat state, messaging, socket events
│   └── useOrb.js            # Widget config, theme, bridge communication
├── services/
│   ├── chatApi.js           # REST API client (messages, profile, feedback)
│   └── customizationApi.js  # Widget config & theme API
├── config/
│   └── bridge.js            # postMessage security (origin validation)
└── utils/
    ├── colorUtils.js        # Color conversion (hex to vec3)
    ├── messageHelpers.js    # Text formatting, price display
    ├── shopifyUtils.js      # Product/order data normalization
    └── validators.js        # Input validation
```

## Embedding

The widget is embedded on merchant storefronts via a **Theme App Extension** (`extensions/jarbris-widget-embed/`). The Liquid block injects `embed.js` from the extension assets, which creates an iframe pointing to the hosted widget build. Merchants enable/disable the widget from **Theme Settings > App Embeds** in the Shopify Admin.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Jarbris API base URL | `http://localhost:5001` |

## Architecture Notes

- **Iframe isolation**: The widget runs in an iframe to avoid CSS/JS conflicts with the host site.
- **postMessage bridge**: All communication with the host page goes through `postMessage` with origin validation (see `config/bridge.js`).
- **ErrorBoundary**: The global error boundary renders `null` on crash — the widget disappears rather than showing broken UI on the merchant's site.
- **Performance**: WebGL RAF loop throttles when minimized and stops when hidden. WDYR tracks unnecessary re-renders in dev mode.
