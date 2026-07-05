/**
 * Debounced tag autocomplete hook shared by search-bar, advanced-search-dialog,
 * and lightbox-viewer. Fires `suggestTags` after a configured debounce window
 * and filters out already-selected tags from the result list.
 */

import { useEffect, useState } from 'react'

import { suggestTags } from '../lib/api.ts'
import { TAG_SUGGEST_DEBOUNCE_MS, TAG_SUGGEST_LIMIT } from '../lib/constants.ts'

/**
 * Returns suggestions for `input`, excluding tags already present in `exclude`.
 * The list is empty when `input` is blank, and API errors are silently swallowed.
 */
export function useTagSuggestions(input: string, exclude: string[]): string[] {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!input.trim()) return

    const timer = setTimeout(async () => {
      try {
        const items = await suggestTags(input.trim(), TAG_SUGGEST_LIMIT)
        setSuggestions(items.filter((s) => !exclude.includes(s)))
      } catch {
        // Swallow errors silently — the UI just shows no suggestions.
      }
    }, TAG_SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, exclude])

  return input.trim() ? suggestions : []
}
