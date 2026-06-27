/**
 * Shared constants: age-rating colors/labels, layout values, debounce delays,
 * suggestion limits, and snackbar durations.
 */

import type { Rating } from '../types.ts'

/** Background tint per age-rating level. */
export const ratingTone: Record<Rating, string> = {
  safe: 'rgba(238, 241, 248, 0.86)',
  suggestive: 'rgba(255, 238, 196, 0.88)',
  explicit: 'rgba(255, 215, 215, 0.9)',
}

/** Display label per age-rating level. */
export const ratingLabel: Record<Rating, string> = {
  safe: 'Safe',
  suggestive: 'Suggestive',
  explicit: 'Explicit',
}

/** Shared height for settings-style tabbed dialogs (golden-ratio proportion). */
export const SETTINGS_PANEL_HEIGHT = '61.8vh'

/** Debounce delay for tag-suggestion API calls (ms). */
export const TAG_SUGGEST_DEBOUNCE_MS = 300

/** Max results returned by `/api/tags/suggest`. */
export const TAG_SUGGEST_LIMIT = 20

/** Snackbar auto-hide duration for success/info (ms). */
export const SNACKBAR_DURATION_SHORT = 4000

/** Snackbar auto-hide duration for errors/long messages (ms). */
export const SNACKBAR_DURATION_LONG = 6000
