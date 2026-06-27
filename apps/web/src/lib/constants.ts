/**
 * Shared display constants: age-rating colors/labels and layout values.
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
