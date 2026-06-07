import { useEffect, useMemo, useState } from 'react'

import type { GalleryItem, LayoutMode } from '../types.ts'

export interface VirtualizerPosition {
  x: number
  y: number
  width: number
  height: number
  item: GalleryItem
  index: number
}

export function useGalleryVirtualizer({
  containerRef,
  items,
  layoutMode,
  columns,
  gap = 8,
  overscan = 1500, // Pre-render 1.5 viewport heights ahead
}: {
  containerRef: React.RefObject<HTMLElement | null>
  items: GalleryItem[]
  layoutMode: LayoutMode
  columns: number
  gap?: number
  overscan?: number
}) {
  const [scrollY, setScrollY] = useState(0)
  const [windowHeight, setWindowHeight] = useState(1000)
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerTop, setContainerTop] = useState(0)

  // Track window scroll, height, and container dimensions
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
      if (containerRef.current) {
        // We only really need top relative to document:
        const rect = containerRef.current.getBoundingClientRect()
        setContainerTop(rect.top + window.scrollY)
      }
    }
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
      handleScroll()
    }

    handleScroll()
    handleResize()

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
      handleScroll()
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [containerRef])

  // Calculate Layout Positions
  const { positions, totalHeight } = useMemo(() => {
    if (containerWidth === 0 || columns === 0 || items.length === 0) {
      return { positions: [], totalHeight: 0 }
    }

    const posArray: VirtualizerPosition[] = []
    let totalH = 0

    if (layoutMode === 'grid') {
      const colWidth = (containerWidth - (columns - 1) * gap) / columns
      items.forEach((item, index) => {
        const row = Math.floor(index / columns)
        const col = index % columns
        const x = col * (colWidth + gap)
        const y = row * (colWidth + gap)
        posArray.push({ x, y, width: colWidth, height: colWidth, item, index })
        if (y + colWidth > totalH) totalH = y + colWidth
      })
    } else if (layoutMode === 'masonry') {
      const colWidth = (containerWidth - (columns - 1) * gap) / columns
      const colHeights = new Array(columns).fill(0)

      items.forEach((item, index) => {
        let minCol = 0
        for (let c = 1; c < columns; c++) {
          if (colHeights[c] < colHeights[minCol]) minCol = c
        }

        const aspect = item.width / item.height
        const height = colWidth / aspect
        const x = minCol * (colWidth + gap)
        const y = colHeights[minCol]

        posArray.push({ x, y, width: colWidth, height, item, index })
        colHeights[minCol] += height + gap
      })
      totalH = Math.max(...colHeights) - gap
    } else if (layoutMode === 'justified') {
      const targetHeight = 240
      let currentRow: { item: GalleryItem; aspect: number; index: number }[] = []
      let currentAspectSum = 0
      let y = 0

      items.forEach((item, index) => {
        const aspect = item.width / item.height
        currentRow.push({ item, aspect, index })
        currentAspectSum += aspect

        const projectedWidth = currentAspectSum * targetHeight + (currentRow.length - 1) * gap

        const isLast = index === items.length - 1
        if (projectedWidth >= containerWidth || isLast) {
          // Calculate the exactly fitting height for this row
          let finalHeight = (containerWidth - (currentRow.length - 1) * gap) / currentAspectSum

          // If it's the last row and it's too short, clamp it
          if (isLast && finalHeight > targetHeight * 1.5) {
            finalHeight = targetHeight
          }

          let x = 0
          for (const obj of currentRow) {
            const w = obj.aspect * finalHeight
            posArray.push({ x, y, width: w, height: finalHeight, item: obj.item, index: obj.index })
            x += w + gap
          }

          y += finalHeight + gap
          currentRow = []
          currentAspectSum = 0
        }
      })
      totalH = y - gap
    }

    return { positions: posArray, totalHeight: totalH }
  }, [items, layoutMode, containerWidth, columns, gap])

  // Filter visible items
  const visiblePositions = useMemo(() => {
    // scrollY is the absolute window scroll
    // The container starts at containerTop relative to the top of the page.
    // So the scroll position relative to the container is:
    const relativeScrollTop = scrollY - containerTop

    const visibleStart = relativeScrollTop - overscan
    const visibleEnd = relativeScrollTop + windowHeight + overscan

    return positions.filter((pos) => {
      const itemTop = pos.y
      const itemBottom = pos.y + pos.height
      return itemBottom >= visibleStart && itemTop <= visibleEnd
    })
  }, [positions, scrollY, containerTop, windowHeight, overscan])

  return { totalHeight, visiblePositions }
}
