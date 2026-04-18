/**
 * Chip Icons — Chip System v2
 *
 * Centralized SVG icon components used by suggestion chips.
 * Each icon renders at 14×14 to fit inline with chip label text.
 *
 * Rule §4: All SVG icons centralized here — no inline SVGs in components.
 */
import React from 'react';

const SIZE = 14;
const common = {
  width: SIZE,
  height: SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};
const stroke = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** 📦 Package / order tracking */
export const PackageIcon = () => (
  <svg {...common}>
    <path
      d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
      {...stroke}
    />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" {...stroke} />
    <line x1="12" y1="22.08" x2="12" y2="12" {...stroke} />
  </svg>
);

/** 💬 Chat / human handoff */
export const ChatIcon = () => (
  <svg {...common}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" {...stroke} />
  </svg>
);

/** 🔄 Return / refund */
export const ReturnIcon = () => (
  <svg {...common}>
    <polyline points="1 4 1 10 7 10" {...stroke} />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" {...stroke} />
  </svg>
);

/** ⭐ Star / popular */
export const StarIcon = () => (
  <svg {...common}>
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      {...stroke}
    />
  </svg>
);

/** 🏷️ Tag / offers */
export const TagIcon = () => (
  <svg {...common}>
    <path
      d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
      {...stroke}
    />
    <line x1="7" y1="7" x2="7.01" y2="7" {...stroke} />
  </svg>
);

/** 🔍 Search / discover */
export const SearchIcon = () => (
  <svg {...common}>
    <circle cx="11" cy="11" r="8" {...stroke} />
    <line x1="21" y1="21" x2="16.65" y2="16.65" {...stroke} />
  </svg>
);

/** 🏬 Grid / catalog */
export const GridIcon = () => (
  <svg {...common}>
    <rect x="3" y="3" width="7" height="7" {...stroke} />
    <rect x="14" y="3" width="7" height="7" {...stroke} />
    <rect x="14" y="14" width="7" height="7" {...stroke} />
    <rect x="3" y="14" width="7" height="7" {...stroke} />
  </svg>
);

/** 🛒 Cart / checkout */
export const CartIcon = () => (
  <svg {...common}>
    <circle cx="9" cy="21" r="1" {...stroke} />
    <circle cx="20" cy="21" r="1" {...stroke} />
    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" {...stroke} />
  </svg>
);

/** External link arrow — used in cross-sell product cards */
export const ExternalLinkIcon = ({ size = 12 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/** Sparkle / cross-sell suggestion indicator */
export const SparkleIcon = ({ size = 13 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

/** Left arrow — used in carousels */
export const ChevronLeftIcon = ({ size = 24 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** Right arrow — used in carousels */
export const ChevronRightIcon = ({ size = 24 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/** Check circle — checkout success confirmation */
export const CheckCircleIcon = ({ size = 28 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/** Compact left chevron — checkout back button */
export const ChevronLeft = ({ size = 14 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** Lock / privacy — privacy consent section header */
export const LockIcon = ({ size = 13 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/** User / profile — profile card header icon */
export const UserIcon = ({ size = 18 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/** Chevron down — collapsible sections */
export const ChevronDownIcon = ({ size = 20 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Back arrow — drawer navigation */
export const BackArrowIcon = ({ size = 18 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

/** X / close — modal and card back dismiss */
export const CloseIcon = ({ size = 16 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/** Info circle — product detail toggle */
export const InfoIcon = ({ size = 16 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

/** Image placeholder — product card with no image */
export const ImagePlaceholderIcon = ({ size = 32 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    stroke="currentColor"
    strokeWidth={1.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5-11 11" />
    <path d="M17 21l-5-5-5 5" />
  </svg>
);

/** Horizontal dots — overflow chip "Mostra altre" control */
export const MoreDotsIcon = ({ size = 14 } = {}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);
