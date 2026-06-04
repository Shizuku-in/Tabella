/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { GallerySort, LayoutMode, RatingFilter } from '../types.ts'

const LAYOUT_STORAGE_KEY = 'tabella.gallery.layout'

interface GalleryUiContextValue {
  layoutMode: LayoutMode
  setLayoutMode: (value: LayoutMode) => void
  searchTags: string[]
  setSearchTags: (value: string[]) => void
  sort: GallerySort
  setSort: (value: GallerySort) => void
  ratingFilter: RatingFilter
  setRatingFilter: (value: RatingFilter) => void
  favoritesOnly: boolean
  setFavoritesOnly: (value: boolean) => void
  masonryColumns: { xs: number; sm: number; lg: number; xl: number }
  setMasonryColumns: (value: { xs: number; sm: number; lg: number; xl: number }) => void
  gridColumns: { xs: number; sm: number; lg: number; xl: number }
  setGridColumns: (value: { xs: number; sm: number; lg: number; xl: number }) => void
  showMobileDetails: boolean
  setShowMobileDetails: (value: boolean) => void
  hoverInfo: { name: boolean; resolution: boolean; tags: boolean; loved: boolean; rating: boolean }
  setHoverInfo: (value: { name: boolean; resolution: boolean; tags: boolean; loved: boolean; rating: boolean }) => void
  showResultsCount: boolean
  setShowResultsCount: (value: boolean) => void
  galleryImageQuality: 'thumbnail' | 'sample' | 'original'
  setGalleryImageQuality: (value: 'thumbnail' | 'sample' | 'original') => void
  lightboxImageQuality: 'thumbnail' | 'sample' | 'original'
  setLightboxImageQuality: (value: 'thumbnail' | 'sample' | 'original') => void
  showLightboxTags: boolean
  setShowLightboxTags: (value: boolean) => void
  selectionMode: boolean
  setSelectionMode: (value: boolean) => void
  selectedIds: Set<number>
  setSelectedIds: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void
  activeDownloadJobId: string | null
  setActiveDownloadJobId: (value: string | null) => void
  topBarConfig: { sort: boolean; layout: boolean; rating: boolean; favorites: boolean; selectMultiple: boolean; search: boolean; themeToggle: boolean }
  setTopBarConfig: (value: { sort: boolean; layout: boolean; rating: boolean; favorites: boolean; selectMultiple: boolean; search: boolean; themeToggle: boolean }) => void
}

const GalleryUiContext = createContext<GalleryUiContextValue | null>(null)

function readInitialLayout(): LayoutMode {
  const storedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  return storedLayout === 'grid' || storedLayout === 'justified'
    ? storedLayout
    : 'masonry'
}

function readInitialColumns() {
  const stored = window.localStorage.getItem('tabella.gallery.columns')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return { xs: 2, sm: 3, lg: 4, xl: 5 }
}

function readInitialGridColumns() {
  const stored = window.localStorage.getItem('tabella.gallery.gridColumns')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return { xs: 2, sm: 3, lg: 4, xl: 5 }
}

function readInitialMobileDetails(): boolean {
  const stored = window.localStorage.getItem('tabella.gallery.mobileDetails')
  return stored !== 'false'
}

function readInitialHoverInfo() {
  const stored = window.localStorage.getItem('tabella.gallery.hoverInfo')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return { name: true, resolution: true, tags: true, loved: true, rating: true }
}

function readInitialResultsCount(): boolean {
  const stored = window.localStorage.getItem('tabella.gallery.resultsCount')
  return stored !== 'false' // default true
}

function readInitialGalleryQuality(): 'thumbnail' | 'sample' | 'original' {
  const stored = window.localStorage.getItem('tabella.gallery.galleryQuality')
  if (stored === 'original') return 'original'
  if (stored === 'sample') return 'sample'
  return 'thumbnail'
}

function readInitialLightboxQuality(): 'thumbnail' | 'sample' | 'original' {
  const stored = window.localStorage.getItem('tabella.gallery.lightboxQuality')
  if (stored === 'original') return 'original'
  if (stored === 'thumbnail') return 'thumbnail'
  return 'sample' // default sample for lightbox
}

function readInitialShowLightboxTags(): boolean {
  const stored = window.localStorage.getItem('tabella.gallery.showLightboxTags')
  return stored === 'true' // default false
}

function readInitialTopBarConfig() {
  const stored = window.localStorage.getItem('tabella.gallery.topBarConfig')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return { sort: true, layout: true, rating: true, favorites: true, selectMultiple: true, search: true, themeToggle: true }
}

export function GalleryUiProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(readInitialLayout)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [sort, setSort] = useState<GallerySort>('newest')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false)
  const [masonryColumns, setMasonryColumns] = useState(readInitialColumns)
  const [gridColumns, setGridColumns] = useState(readInitialGridColumns)
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(readInitialMobileDetails)
  const [hoverInfo, setHoverInfo] = useState(readInitialHoverInfo)
  const [showResultsCount, setShowResultsCount] = useState<boolean>(readInitialResultsCount)
  const [galleryImageQuality, setGalleryImageQuality] = useState<'thumbnail' | 'sample' | 'original'>(readInitialGalleryQuality)
  const [lightboxImageQuality, setLightboxImageQuality] = useState<'thumbnail' | 'sample' | 'original'>(readInitialLightboxQuality)
  const [showLightboxTags, setShowLightboxTags] = useState<boolean>(readInitialShowLightboxTags())
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeDownloadJobId, setActiveDownloadJobId] = useState<string | null>(null)
  const [topBarConfig, setTopBarConfig] = useState(readInitialTopBarConfig)

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode)
  }, [layoutMode])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.columns', JSON.stringify(masonryColumns))
  }, [masonryColumns])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.gridColumns', JSON.stringify(gridColumns))
  }, [gridColumns])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.mobileDetails', String(showMobileDetails))
  }, [showMobileDetails])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.hoverInfo', JSON.stringify(hoverInfo))
  }, [hoverInfo])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.resultsCount', String(showResultsCount))
  }, [showResultsCount])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.galleryQuality', galleryImageQuality)
  }, [galleryImageQuality])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.lightboxQuality', lightboxImageQuality)
  }, [lightboxImageQuality])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.showLightboxTags', String(showLightboxTags))
  }, [showLightboxTags])

  useEffect(() => {
    window.localStorage.setItem('tabella.gallery.topBarConfig', JSON.stringify(topBarConfig))
  }, [topBarConfig])

  useEffect(() => {
    if (!selectionMode) {
      setSelectedIds(new Set())
    }
  }, [selectionMode])

  return (
    <GalleryUiContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        searchTags,
        setSearchTags,
        sort,
        setSort,
        ratingFilter,
        setRatingFilter,
        favoritesOnly,
        setFavoritesOnly,
        masonryColumns,
        setMasonryColumns,
        gridColumns,
        setGridColumns,
        showMobileDetails,
        setShowMobileDetails,
        hoverInfo,
        setHoverInfo,
        showResultsCount,
        setShowResultsCount,
        galleryImageQuality,
        setGalleryImageQuality,
        lightboxImageQuality,
        setLightboxImageQuality,
        showLightboxTags,
        setShowLightboxTags,
        selectionMode,
        setSelectionMode,
        selectedIds,
        setSelectedIds,
        activeDownloadJobId,
        setActiveDownloadJobId,
        topBarConfig,
        setTopBarConfig,
      }}
    >
      {children}
    </GalleryUiContext.Provider>
  )
}

export function useGalleryUi() {
  const value = useContext(GalleryUiContext)

  if (!value) {
    throw new Error('useGalleryUi must be used inside GalleryUiProvider')
  }

  return value
}
