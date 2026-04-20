import React, { memo, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { AnimatePresence, motion } from 'framer-motion';
import { CHIP_ICON_MAP } from '../UI/chipIconMap';
import { MoreDotsIcon, ChevronLeft } from '../UI/Icons';
import { useI18n } from '../../hooks/useI18n';
import './Suggestions.css';

/**
 * Number of chips visible in the first "page".
 * INVARIANT: API MAX_CHIPS_HARD >= VISIBLE_CHIPS (currently 20 >= 4, satisfied).
 */
const VISIBLE_CHIPS = 4;

/**
 * Minimum total chips required to activate overflow paging.
 * With 5 chips the overflow page would show only 1 chip — poor UX.
 * At 6+ chips we always have at least 2 chips on the overflow page.
 */
const OVERFLOW_THRESHOLD = 6;

/**
 * Suggestions
 * Renders a list of interactive chips to guide the user.
 * Chip System v2: renders SVG icons when chip has an `icon` field.
 *
 * Overflow paging: when suggestions.length >= OVERFLOW_THRESHOLD,
 * shows first VISIBLE_CHIPS chips + a UI control "Mostra altre N".
 * Click replaces the set with all remaining chips + a "Indietro" control.
 * These controls are pure UI and do NOT trigger onSuggestionClick.
 */
const Suggestions = memo(({ suggestions, onSuggestionClick }) => {
  const t = useI18n();
  // Content-based reset: store the last-seen key alongside the overflow flag.
  // When the key changes (new chip set), React detects the stale stored key
  // during render and resets showOverflow before painting — no effect needed.
  // Pattern: https://react.dev/learn/you-might-not-need-an-effect#storing-information-from-previous-renders
  const suggestionsKey = suggestions ? suggestions.map((s) => s.label).join('|') : '';
  const [overflowState, setOverflowState] = useState({ showOverflow: false, lastKey: suggestionsKey });

  let showOverflow = overflowState.showOverflow;
  if (overflowState.lastKey !== suggestionsKey) {
    setOverflowState({ showOverflow: false, lastKey: suggestionsKey });
    showOverflow = false;
  }

  if (!suggestions || suggestions.length === 0) return null;

  const hasOverflow = suggestions.length >= OVERFLOW_THRESHOLD;
  const overflowCount = suggestions.length - VISIBLE_CHIPS;

  // Which chips to render:
  // - No overflow or overflow not active: first VISIBLE_CHIPS (or all if < threshold)
  // - Overflow active: everything after VISIBLE_CHIPS
  const visibleChips =
    hasOverflow && showOverflow
      ? suggestions.slice(VISIBLE_CHIPS)
      : hasOverflow
        ? suggestions.slice(0, VISIBLE_CHIPS)
        : suggestions;

  const chipVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, delay: 0.1 + i * 0.05, ease: 'easeOut' },
    }),
    exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
  };

  return (
    <div className="jarbris-suggestions">
      <AnimatePresence mode="wait">
        <motion.div
          key={showOverflow ? 'overflow' : 'main'}
          className="jarbris-suggestions-inner"
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {visibleChips.map((s, idx) => {
            const IconComponent = s.icon ? CHIP_ICON_MAP[s.icon] : null;

            return (
              <motion.button
                key={s.label}
                className={`jarbris-suggestion-chip ${s.variant || ''}`}
                custom={idx}
                variants={chipVariants}
                onClick={() => onSuggestionClick(s)}
                aria-label={`Suggerimento: ${s.label}`}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                {IconComponent && <IconComponent />}
                {s.label}
              </motion.button>
            );
          })}

          {/* "Mostra altre" — UI control, not a suggestion */}
          {hasOverflow && !showOverflow && (
            <motion.button
              key="overflow-toggle"
              type="button"
              className="jarbris-suggestion-chip overflow"
              custom={visibleChips.length}
              variants={chipVariants}
              onClick={() => setOverflowState({ showOverflow: true, lastKey: suggestionsKey })}
              aria-label={t('ui.aria_more_options', { count: overflowCount })}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <MoreDotsIcon />
              {t('ui.more_options_count', { count: overflowCount })}
            </motion.button>
          )}

          {/* "Indietro" — UI control, not a suggestion */}
          {hasOverflow && showOverflow && (
            <motion.button
              key="back-toggle"
              type="button"
              className="jarbris-suggestion-chip back"
              custom={visibleChips.length}
              variants={chipVariants}
              onClick={() => setOverflowState({ showOverflow: false, lastKey: suggestionsKey })}
              aria-label={t('ui.back_to_options')}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft size={12} />
              {t('ui.back')}
            </motion.button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default Suggestions;
