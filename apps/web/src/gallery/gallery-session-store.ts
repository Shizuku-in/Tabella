/**
 * Session-scoped gallery state: search, filters, sort, selection.
 */

import { create } from 'zustand'

import type { GallerySort, RatingFilter } from '../types.ts'

interface GallerySessionState {
  searchTags: string[]
  setSearchTags: (value: string[]) => void
  sort: GallerySort
  setSort: (value: GallerySort) => void
  randomSeed: number
  setRandomSeed: (value: number) => void
  ratingFilter: RatingFilter
  setRatingFilter: (value: RatingFilter) => void
  favoritesOnly: boolean
  setFavoritesOnly: (value: boolean) => void
  selectionMode: boolean
  setSelectionMode: (value: boolean) => void
  selectedIds: Set<number>
  setSelectedIds: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void
  activeDownloadJobId: string | null
  setActiveDownloadJobId: (value: string | null) => void

  showAdvancedSearch: boolean
  setShowAdvancedSearch: (value: boolean) => void
  advancedIncludeTags: string[]
  setAdvancedIncludeTags: (value: string[]) => void
  excludeTags: string[]
  setExcludeTags: (value: string[]) => void
  uploadedAfter: string | null
  setUploadedAfter: (value: string | null) => void
  uploadedBefore: string | null
  setUploadedBefore: (value: string | null) => void
  minWidth: number | null
  setMinWidth: (value: number | null) => void
  minHeight: number | null
  setMinHeight: (value: number | null) => void
  aspectRatioMin: number | null
  setAspectRatioMin: (value: number | null) => void
  aspectRatioMax: number | null
  setAspectRatioMax: (value: number | null) => void
}

export const useGallerySessionStore = create<GallerySessionState>((set) => ({
  searchTags: [],
  setSearchTags: (value) =>
    set((state) => {
      const isAdvancedActive =
        state.advancedIncludeTags.length > 0 ||
        state.excludeTags.length > 0 ||
        state.uploadedAfter !== null ||
        state.uploadedBefore !== null ||
        state.minWidth !== null ||
        state.minHeight !== null ||
        state.aspectRatioMin !== null ||
        state.aspectRatioMax !== null

      if (value.length > 0 && isAdvancedActive) {
        // When basic search is activated, clear advanced search to avoid conflicting filters
        return {
          searchTags: value,
          advancedIncludeTags: [],
          excludeTags: [],
          uploadedAfter: null,
          uploadedBefore: null,
          minWidth: null,
          minHeight: null,
          aspectRatioMin: null,
          aspectRatioMax: null,
        }
      }
      return { searchTags: value }
    }),

  sort: 'newest',
  setSort: (value) => {
    if (value === 'random') {
      set({ sort: value, randomSeed: Math.floor(Math.random() * 1000000) })
    } else {
      set({ sort: value })
    }
  },
  randomSeed: Math.floor(Math.random() * 1000000),
  setRandomSeed: (value) => set({ randomSeed: value }),

  ratingFilter: 'all',
  setRatingFilter: (value) => set({ ratingFilter: value }),

  favoritesOnly: false,
  setFavoritesOnly: (value) => set({ favoritesOnly: value }),

  selectionMode: false,
  setSelectionMode: (value) =>
    set((state) => {
      if (!value && state.selectedIds.size > 0) {
        return { selectionMode: value, selectedIds: new Set() }
      }
      return { selectionMode: value }
    }),

  selectedIds: new Set(),
  setSelectedIds: (value) =>
    set((state) => ({
      selectedIds: typeof value === 'function' ? value(state.selectedIds) : value,
    })),

  activeDownloadJobId: null,
  setActiveDownloadJobId: (value) => set({ activeDownloadJobId: value }),

  showAdvancedSearch: false,
  setShowAdvancedSearch: (value) => set({ showAdvancedSearch: value }),

  advancedIncludeTags: [],
  setAdvancedIncludeTags: (value) => set({ advancedIncludeTags: value }),

  excludeTags: [],
  setExcludeTags: (value) => set({ excludeTags: value }),

  uploadedAfter: null,
  setUploadedAfter: (value) => set({ uploadedAfter: value }),

  uploadedBefore: null,
  setUploadedBefore: (value) => set({ uploadedBefore: value }),

  minWidth: null,
  setMinWidth: (value) => set({ minWidth: value }),

  minHeight: null,
  setMinHeight: (value) => set({ minHeight: value }),

  aspectRatioMin: null,
  setAspectRatioMin: (value) => set({ aspectRatioMin: value }),

  aspectRatioMax: null,
  setAspectRatioMax: (value) => set({ aspectRatioMax: value }),
}))
