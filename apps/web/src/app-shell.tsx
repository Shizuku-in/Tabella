/**
 * App shell: top navigation bar + scrollable content area.
 * `AdvancedSearchDialog` is lazy-loaded because it pulls in the heavy
 * date-picker dependency (~360 KB gzipped).
 */

import type { PaletteMode } from '@mui/material'
import { Box, Container } from '@mui/material'
import { lazy, Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { SettingsDialog } from './components/settings-dialog.tsx'
import { TopNavigation } from './components/top-navigation.tsx'

const AdvancedSearchDialog = lazy(() =>
  import('./components/advanced-search-dialog.tsx').then((m) => ({
    default: m.AdvancedSearchDialog,
  })),
)

interface AppShellProps {
  mode: PaletteMode
  onToggleMode: () => void
}

export default function AppShell({ mode, onToggleMode }: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  // Keep the dialog mounted after the first open so the MUI close transition plays.
  const [hasOpenedAdvancedSearch, setHasOpenedAdvancedSearch] = useState(false)

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <TopNavigation
        mode={mode}
        onToggleMode={onToggleMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdvancedSearch={() => {
          setHasOpenedAdvancedSearch(true)
          setAdvancedSearchOpen(true)
        }}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {hasOpenedAdvancedSearch && (
        <Suspense fallback={null}>
          <AdvancedSearchDialog
            open={advancedSearchOpen}
            onClose={() => setAdvancedSearchOpen(false)}
          />
        </Suspense>
      )}

      <Container
        maxWidth={false}
        sx={{
          px: { xs: 1, sm: 1.5, lg: 2 },
          py: { xs: 1, sm: 1.25, lg: 1.5 },
        }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}
