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
}

const GalleryUiContext = createContext<GalleryUiContextValue | null>(null)

function readInitialLayout(): LayoutMode {
  const storedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  return storedLayout === 'grid' || storedLayout === 'justified'
    ? storedLayout
    : 'masonry'
}

export function GalleryUiProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(readInitialLayout)
  const [searchText, setSearchText] = useState('')
  const [sort, setSort] = useState<GallerySort>('newest')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all')

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode)
  }, [layoutMode])

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
