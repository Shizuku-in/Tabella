/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Box, Tooltip, IconButton, Autocomplete, TextField, Chip, Drawer, useTheme, useMediaQuery, Stack, Popper, Grow } from '@mui/material'
import type { PopperProps } from '@mui/material'
import { Search, ArrowBack } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useShallow } from 'zustand/react/shallow'
import { suggestTags } from '../lib/api.ts'
import { getTagColor } from '../lib/tags.ts'

const CustomPopper = function (props: PopperProps) {
  return (
    <Popper {...props} transition placement="bottom-start">
      {({ TransitionProps }) => (
        <Grow {...TransitionProps} timeout={200}>
          <Box sx={{ transformOrigin: 'top left' }}>{props.children as ReactNode}</Box>
        </Grow>
      )}
    </Popper>
  )
}

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

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [searchVisible, setSearchVisible] = useState(() => !isMobile && searchTags.length > 0)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

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
      if (isMobile) {
        setTimeout(() => mobileInputRef.current?.focus(), 100)
      } else {
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
    }
  }, [searchVisible, isMobile])

  useEffect(() => {
    if (searchTags.length > 0 && !isMobile) {
      setSearchVisible(true)
    }
  }, [searchTags, isMobile])

  const handleSearchBlur = () => {
    if (!isMobile && searchTags.length === 0) {
      setSearchVisible(false)
    }
  }

  const renderAutocomplete = (isMobileView: boolean) => (
    <Autocomplete
      multiple
      freeSolo
      disableClearable
      PopperComponent={CustomPopper}
      options={tagSuggestions}
      filterOptions={(x) => x}
      value={searchTags}
      inputValue={tagInput}
      onInputChange={(_, newValue) => setTagInput(newValue)}
      onChange={(_, newValue) => {
        const uniqueTags = Array.from(new Set(newValue as string[]))
        setSearchTags(uniqueTags)
      }}
      onBlur={isMobileView ? undefined : handleSearchBlur}
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
          inputRef={isMobileView ? mobileInputRef : searchInputRef}
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
              '&:before': { borderBottomColor: isMobileView ? 'transparent' : 'divider' },
              '&:after': { borderBottomWidth: isMobileView ? '0' : '2px' },
              '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottomColor: isMobileView ? 'transparent' : 'text.secondary' },
              pt: 0,
              pb: isMobileView ? 0 : 0.5,
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
  )

  return (
    <>
      {!isMobile && (
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
          {renderAutocomplete(false)}
        </Box>
      )}

      <Tooltip title="Search">
        <IconButton
          color={searchVisible || searchTags.length > 0 ? 'primary' : 'default'}
          aria-label="toggle search"
          onClick={() => {
            if (searchVisible && searchTags.length === 0) {
              setSearchVisible(false)
            } else {
              setSearchVisible(true)
            }
          }}
          sx={{ p: 0.75, borderRadius: '50%' }}
        >
          <Search fontSize="small" />
        </IconButton>
      </Tooltip>

      {isMobile && (
        <Drawer
          anchor="top"
          open={searchVisible}
          onClose={() => setSearchVisible(false)}
          sx={{ zIndex: (theme) => theme.zIndex.appBar + 100 }}
          PaperProps={{
            sx: {
              bgcolor: 'background.paper',
              backgroundImage: 'none',
              px: 1,
              py: 0,
              height: 50,
              borderBottom: '1px solid',
              borderColor: 'divider',
              justifyContent: 'center',
            },
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ height: '100%' }}>
            <IconButton
              edge="start"
              color="default"
              onClick={() => setSearchVisible(false)}
              aria-label="close search"
              sx={{ p: 0.75, ml: 0.25 }}
            >
              <ArrowBack fontSize="small" />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {renderAutocomplete(true)}
            </Box>
          </Stack>
        </Drawer>
      )}
    </>
  )
}
