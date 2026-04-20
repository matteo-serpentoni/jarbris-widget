import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, t } from '../i18n';

/**
 * Subscribes the component to language changes via useSyncExternalStore.
 * Fires at most once per session (when bootData.lng overrides navigator.language).
 * Returns t() — always reflects the current language, no stale closure risk.
 */
export function useI18n() {
  useSyncExternalStore(subscribe, getSnapshot);
  return t;
}
