/**
 * Widget Storage Utility
 *
 * Centralized localStorage access with automatic error handling
 * for Safari ITP, Firefox ETP, and quota exceeded errors.
 * All keys are auto-prefixed with 'jarbris_'.
 *
 * security.md #3: Only strictly-necessary keys are permitted.
 * Permitted keys: session_id, messages, session_time, session_status, profile, shop_domain
 *
 * @module utils/storage
 */

const PREFIX = 'jarbris_';

/**
 * Get a value from localStorage (auto-prefixed).
 * @param {string} key - Key name without prefix
 * @returns {string|null}
 */
function get(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * Set a value in localStorage (auto-prefixed).
 * @param {string} key - Key name without prefix
 * @param {string} value - Value to store
 */
function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Safari ITP, quota exceeded, or extreme privacy settings
  }
}

/**
 * Remove a key from localStorage (auto-prefixed).
 * @param {string} key - Key name without prefix
 */
function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Silent
  }
}

/**
 * Get and parse a JSON value from localStorage.
 * @param {string} key - Key name without prefix
 * @returns {object|null}
 */
function getJSON(key) {
  const raw = get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Serialize and store a JSON value in localStorage.
 * @param {string} key - Key name without prefix
 * @param {object} value - Value to serialize and store
 */
function setJSON(key, value) {
  set(key, JSON.stringify(value));
}

/**
 * Clear all jarbris_ keys except the explicitly preserved ones.
 * 'profile' is preserved per security.md #3 (user-submitted data).
 * 'shop_domain' is preserved for dev tools consistency.
 */
function clearSession() {
  try {
    const preserve = new Set([
      PREFIX + 'profile',
      PREFIX + 'dev_shop_domain',
      PREFIX + 'dev_show_storefront',
      PREFIX + 'dev_storefront_theme',
      PREFIX + 'dev_lng_override'
    ]);
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(PREFIX) && !preserve.has(key)) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Silent
  }
}

/**
 * Get the normalized user profile from localStorage.
 * Enforces a fixed schema: { name, email, isIdentified }.
 * @returns {{ name: string, email: string, isIdentified: boolean }|null}
 */
function getProfile() {
  const raw = getJSON('profile');
  if (!raw) return null;
  return {
    name: raw.name || '',
    email: raw.email || '',
    isIdentified: !!raw.isIdentified,
  };
}

/**
 * Save a normalized profile to localStorage.
 * Enforces a fixed schema to prevent shape drift.
 * @param {{ name?: string, email?: string, isIdentified?: boolean }} profile
 */
function setProfile({ name, email, isIdentified }) {
  setJSON('profile', {
    name: name || '',
    email: email || '',
    isIdentified: !!isIdentified,
  });
}

/**
 * Remove the saved profile from localStorage.
 */
function removeProfile() {
  remove('profile');
}

export default {
  get,
  set,
  remove,
  getJSON,
  setJSON,
  clearSession,
  getProfile,
  setProfile,
  removeProfile,
};
