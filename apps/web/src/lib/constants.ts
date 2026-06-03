import type { Rating } from '../types.ts'

export const ratingTone: Record<Rating, string> = {
  safe: 'rgba(238, 241, 248, 0.86)',
  suggestive: 'rgba(255, 238, 196, 0.88)',
  explicit: 'rgba(255, 215, 215, 0.9)',
}

export const ratingLabel: Record<Rating, string> = {
  safe: 'Safe',
  suggestive: 'Suggestive',
  explicit: 'Explicit',
}
