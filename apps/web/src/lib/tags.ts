/**
 * Tag display helpers.
 */

import type { Theme } from '@mui/material/styles'

/**
 * Returns the MUI palette color for a tag based on its namespace.
 * Bare tags (no `:`) and unknown namespaces fall back to `tags.unprefixed`.
 */
export function getTagColor(tag: string, theme: Theme): string {
  if (!tag.includes(':')) {
    return theme.palette.tags.unprefixed
  }

  const namespace = tag.split(':')[0].toLowerCase()
  switch (namespace) {
    case 'parody':
      return theme.palette.tags.parody
    case 'character':
      return theme.palette.tags.character
    case 'artist':
      return theme.palette.tags.artist
    case 'general':
      return theme.palette.tags.general
    default:
      return theme.palette.tags.unprefixed
  }
}
