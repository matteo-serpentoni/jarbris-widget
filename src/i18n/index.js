// SCALE-LIMIT: 6 supported locales. To add a language: add JSON file + entry in BUNDLES.
import en from './locales/en.json';
import it from './locales/it.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';

const BUNDLES = { en, it, es, fr, de, pt };
const FALLBACK = 'en';

// FIX 1: Guard — safe in Node (Jest/Vitest) and non-browser environments.
function detectLang() {
  if (typeof navigator === 'undefined') return FALLBACK;

  // DevTools language simulator override
  if (import.meta.env?.DEV) {
    const devOverride = localStorage.getItem('jarbris_dev_lng_override');
    if (devOverride && devOverride in BUNDLES) return devOverride;
  }

  // 1. OS/Browser system language (User-centric personal concierge — highest priority)
  if (typeof navigator !== 'undefined' && navigator.language) {
    const navLang = navigator.language.slice(0, 2).toLowerCase();
    if (navLang in BUNDLES) return navLang;
  }

  // 2. Document HTML lang (Shopify fallback if user OS language is unsupported)
  const htmlLang = typeof document !== 'undefined' ? document.documentElement?.lang : null;
  if (htmlLang) {
    const normalizedHtml = htmlLang.slice(0, 2).toLowerCase();
    if (normalizedHtml in BUNDLES) return normalizedHtml;
  }

  return FALLBACK;
}

let _lng = detectLang();
const _listeners = new Set();

function resolve(obj, key) {
  return key.split('.').reduce((acc, k) => acc?.[k], obj);
}

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in params ? String(params[k]) : `{{${k}}}`));
}

/**
 * Override the language detected from navigator.language.
 * Called once after bootData.lng arrives from the API.
 * FIX 2: Normalizes full locale codes (e.g. 'fr-FR', 'pt-BR') before validating.
 */
export function setLng(lng) {
  if (!lng) return;

  // DevTools language simulator priority lock
  if (import.meta.env?.DEV) {
    if (localStorage.getItem('jarbris_dev_lng_override')) return;
  }
  const normalized = lng.slice(0, 2).toLowerCase();
  if (normalized === _lng || !(normalized in BUNDLES)) return;
  _lng = normalized;
  _listeners.forEach((fn) => fn());
}

/**
 * Translate a dot-notated key with optional interpolation params.
 * Falls back to the English bundle, then to the raw key if missing everywhere.
 * Safe to call outside React (hooks, utils, non-component code).
 */
export function t(key, params) {
  const bundle = BUNDLES[_lng];
  const fallback = BUNDLES[FALLBACK];
  const val = resolve(bundle, key) ?? resolve(fallback, key) ?? key;
  return interpolate(val, params);
}

// useSyncExternalStore contract
export const subscribe = (fn) => {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
};

export const getSnapshot = () => _lng;
