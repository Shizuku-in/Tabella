import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { GallerySort, LayoutMode, RatingFilter } from '../types.ts'

const LAYOUT_STORAGE_KEY = 'tabella.gallery.layout'

interface GalleryUiContextValue {
  layoutMode: LayoutMode
  setLayoutMode: (value: LayoutMode) => void
  searchText: string
  setSearchText: (value: string) => void
  sort: GallerySort
  setSort: (value: GallerySort) => void
  ratingFilter: RatingFilter
  setRatingFilter: (value: RatingFilter) => void
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
    try { return JSON.parse(stored) } catch (e) { /* ignore */ }
  }
  return { xs: 2, sm: 3, lg: 4, xl: 5 }
}

function readInitialGridColumns() {
  const stored = window.localStorage.getItem('tabella.gallery.gridColumns')
  if (stored) {
    try { return JSON.parse(stored) } catch (e) { /* ignore */ }
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
    try { return JSON.parse(stored) } catch (e) { /* ignore */ }
  }
  return { name: true, resolution: true, tags: true, loved: true, rating: true }
}

function readInitialResultsCount(): boolean {
  const stored = window.localStorage.getItem('tabella.gallery.showResultsCount')
  return stored === 'true'
}

export function GalleryUiProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(readInitialLayout)
  const [searchText, setSearchText] = useState('')
  const [sort, setSort] = useState<GallerySort>('newest')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')
  const [masonryColumns, setMasonryColumns] = useState(readInitialColumns)
  const [gridColumns, setGridColumns] = useState(readInitialGridColumns)
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(readInitialMobileDetails)
  const [hoverInfo, setHoverInfo] = useState(readInitialHoverInfo)
  const [showResultsCount, setShowResultsCount] = useState<boolean>(readInitialResultsCount)

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
    window.localStorage.setItem('tabella.gallery.showResultsCount', String(showResultsCount))
  }, [showResultsCount])

  return (
    <GalleryUiContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        searchText,
        setSearchText,
        sort,
        setSort,
        ratingFilter,
        setRatingFilter,
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
