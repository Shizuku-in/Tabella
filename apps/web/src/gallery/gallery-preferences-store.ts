/**
 * Persisted gallery preferences: layout, visibility toggles, sort order.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { LayoutMode } from '../types.ts'

export interface TopBarConfig {
  sort: boolean
  layout: boolean
  rating: boolean
  favorites: boolean
  selectMultiple: boolean
  search: boolean
  advancedSearch: boolean
  themeToggle: boolean
}

export interface HoverInfoConfig {
  name: boolean
  resolution: boolean
  tags: boolean
  favorite: boolean
  rating: boolean
  download: boolean
}

export type ColumnConfig = Record<string, number>

interface GalleryPreferencesState {
  layoutMode: LayoutMode
  setLayoutMode: (value: LayoutMode) => void
  masonryColumns: ColumnConfig
  setMasonryColumns: (value: ColumnConfig) => void
  gridColumns: ColumnConfig
  setGridColumns: (value: ColumnConfig) => void
  justifiedRowHeight: ColumnConfig
  setJustifiedRowHeight: (value: ColumnConfig) => void
  showMobileDetails: boolean
  setShowMobileDetails: (value: boolean) => void
  hoverInfo: HoverInfoConfig
  setHoverInfo: (value: HoverInfoConfig) => void
  showResultsCount: boolean
  setShowResultsCount: (value: boolean) => void
  galleryImageQuality: 'thumbnail' | 'sample' | 'original'
  setGalleryImageQuality: (value: 'thumbnail' | 'sample' | 'original') => void
  lightboxImageQuality: 'thumbnail' | 'sample' | 'original'
  setLightboxImageQuality: (value: 'thumbnail' | 'sample' | 'original') => void
  showLightboxTags: boolean
  setShowLightboxTags: (value: boolean) => void
  hoverDownloadQuality: 'thumbnail' | 'sample' | 'original'
  setHoverDownloadQuality: (value: 'thumbnail' | 'sample' | 'original') => void
  topBarConfig: TopBarConfig
  setTopBarConfig: (value: TopBarConfig) => void
}

export const useGalleryPreferencesStore = create<GalleryPreferencesState>()(
  persist(
    (set) => ({
      layoutMode: 'masonry',
      setLayoutMode: (value) => set({ layoutMode: value }),

      masonryColumns: { xs: 2, sm: 3, lg: 4, xl: 5 },
      setMasonryColumns: (value) => set({ masonryColumns: value }),

      gridColumns: { xs: 2, sm: 3, lg: 4, xl: 5 },
      setGridColumns: (value) => set({ gridColumns: value }),

      justifiedRowHeight: { xs: 150, sm: 210, lg: 240, xl: 300 },
      setJustifiedRowHeight: (value) => set({ justifiedRowHeight: value }),

      showMobileDetails: true,
      setShowMobileDetails: (value) => set({ showMobileDetails: value }),

      hoverInfo: {
        name: false,
        resolution: true,
        tags: false,
        favorite: true,
        rating: true,
        download: true,
      },
      setHoverInfo: (value) => set({ hoverInfo: value }),

      showResultsCount: false,
      setShowResultsCount: (value) => set({ showResultsCount: value }),

      galleryImageQuality: 'thumbnail',
      setGalleryImageQuality: (value) => set({ galleryImageQuality: value }),

      lightboxImageQuality: 'sample',
      setLightboxImageQuality: (value) => set({ lightboxImageQuality: value }),

      showLightboxTags: false,
      setShowLightboxTags: (value) => set({ showLightboxTags: value }),

      hoverDownloadQuality: 'original',
      setHoverDownloadQuality: (value) => set({ hoverDownloadQuality: value }),

      topBarConfig: {
        sort: true,
        layout: true,
        rating: false,
        favorites: false,
        selectMultiple: true,
        search: true,
        advancedSearch: false,
        themeToggle: true,
      },
      setTopBarConfig: (value) => set({ topBarConfig: value }),
    }),
    {
      // Persisted to localStorage under key 'tabella.gallery.preferences'.
      // Serialization (JSON) is handled automatically by zustand/persist.
      name: 'tabella.gallery.preferences',
      version: 1,
    },
  ),
)
