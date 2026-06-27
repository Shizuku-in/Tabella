/**
 * App shell: top navigation bar + scrollable content area.
 */

import type { PaletteMode } from '@mui/material'
import { Box, Container } from '@mui/material'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AdvancedSearchDialog } from './components/advanced-search-dialog.tsx'
import { SettingsDialog } from './components/settings-dialog.tsx'
import { TopNavigation } from './components/top-navigation.tsx'

interface AppShellProps {
  mode: PaletteMode
  onToggleMode: () => void
}

export default function AppShell({ mode, onToggleMode }: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <TopNavigation
        mode={mode}
        onToggleMode={onToggleMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdvancedSearch={() => setAdvancedSearchOpen(true)}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <AdvancedSearchDialog
        open={advancedSearchOpen}
        onClose={() => setAdvancedSearchOpen(false)}
      />

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
