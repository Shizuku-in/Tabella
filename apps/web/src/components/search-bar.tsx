/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useRef, useEffect } from 'react'
import { Box, Tooltip, IconButton, Autocomplete, TextField, Chip } from '@mui/material'
import { Search } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useShallow } from 'zustand/react/shallow'
import { suggestTags } from '../lib/api.ts'
import { getTagColor } from '../lib/tags.ts'

export function SearchBar() {
  const {
    searchTags,
    setSearchTags,
  } = useGallerySessionStore(
    useShallow((state) => ({
      searchTags: state.searchTags,
      setSearchTags: state.setSearchTags,
    }))
  )

  const [searchVisible, setSearchVisible] = useState(() => searchTags.length > 0)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tagInput.trim()) {
      setTagSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const suggestions = await suggestTags(tagInput.trim(), 20)
        setTagSuggestions(suggestions.filter((s) => !searchTags.includes(s)))
      } catch {
        setTagSuggestions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tagInput, searchTags])

  useEffect(() => {
    if (searchVisible) {
      searchInputRef.current?.focus()
    }
  }, [searchVisible])

  useEffect(() => {
    if (searchTags.length > 0) {
      setSearchVisible(true)
    }
  }, [searchTags])

  const handleSearchBlur = () => {
    if (searchTags.length === 0) {
      setSearchVisible(false)
    }
  }

  return (
    <>
      <Box
        sx={{
          width: searchVisible ? { xs: 150, sm: 184, md: 212 } : 0,
          opacity: searchVisible ? 1 : 0,
          transform: searchVisible ? 'translateX(0)' : 'translateX(14px)',
          transformOrigin: 'right center',
          overflow: 'hidden',
          pointerEvents: searchVisible ? 'auto' : 'none',
          transition:
            'width 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms ease, transform 180ms cubic-bezier(0.4, 0, 0.2, 1), margin 180ms cubic-bezier(0.4, 0, 0.2, 1)',
          ml: searchVisible ? 1.25 : 0,
          mr: searchVisible ? 0.25 : 0,
        }}
      >
        <Autocomplete
          multiple
          freeSolo
          options={tagSuggestions}
          filterOptions={(x) => x}
          value={searchTags}
          inputValue={tagInput}
          onInputChange={(_, newValue) => setTagInput(newValue)}
          onChange={(_, newValue) => {
            const uniqueTags = Array.from(new Set(newValue as string[]))
            setSearchTags(uniqueTags)
          }}
          onBlur={handleSearchBlur}
          size="small"
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const { key, ...chipProps } = getTagProps({ index })
              return (
                <Chip
                  {...chipProps}
                  key={key}
                  label={option}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.75rem',
                    bgcolor: (theme) => alpha(getTagColor(option, theme), 0.15),
                    color: (theme) => getTagColor(option, theme),
                  }}
                />
              )
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={searchInputRef}
              variant="standard"
              placeholder={searchTags.length === 0 ? 'Search' : ''}
              fullWidth
              onKeyDown={(event) => {
                if (event.key === 'Escape' && searchTags.length === 0) {
                  setSearchVisible(false)
                }
              }}
              sx={{
                '& .MuiInput-root': {
                  minHeight: 30,
                  fontSize: '0.9rem',
                  color: 'text.primary',
                  '&:before': { borderBottomColor: 'divider' },
                  '&:after': { borderBottomWidth: '2px' },
                  '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottomColor: 'text.secondary' },
                  pt: 0,
                  pb: 0.5,
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                },
                '& .MuiInputBase-input': {
                  py: 0.25,
                  px: 0,
                },
              }}
            />
          )}
        />
      </Box>

      <Tooltip title="Search">
        <IconButton
          color={searchVisible || searchTags.length > 0 ? 'primary' : 'default'}
          aria-label="toggle search"
          onClick={() => {
            if (searchVisible && searchTags.length === 0) {
              setSearchVisible(false)
            } else {
              setSearchVisible(true)
              setTimeout(() => searchInputRef.current?.focus(), 100)
            }
          }}
          sx={{ p: 0.75, borderRadius: '50%' }}
        >
          <Search fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  )
}
