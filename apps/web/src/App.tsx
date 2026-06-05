import { startTransition, useState } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import type { PaletteMode } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/auth-provider.tsx'
import { RequireAuth, RequireRole } from './auth/route-guards.tsx'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import AppShell from './app-shell.tsx'

import { AdminImportsPage } from './pages/admin-imports-page.tsx'
import { GalleryPage } from './pages/gallery-page.tsx'
import { LoginPage } from './pages/login-page.tsx'
import { AdminUsersPage } from './pages/admin-users-page.tsx'
import { AdminServerPage } from './pages/admin-server-page.tsx'
import { ProfilePage } from './pages/profile-page.tsx'
import { NotFoundPage } from './pages/not-found-page.tsx'
import { buildTheme } from './theme.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function detectInitialMode(): PaletteMode {
  const storedMode = localStorage.getItem('theme-mode')
  if (storedMode === 'light' || storedMode === 'dark') {
    return storedMode
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function App() {
  const [mode, setMode] = useState<PaletteMode>(detectInitialMode)

  const handleToggleMode = () => {
    startTransition(() => {
      setMode((currentMode) => {
        const newMode = currentMode === 'light' ? 'dark' : 'light'
        localStorage.setItem('theme-mode', newMode)
        return newMode
      })
    })
  }

  return (
    <ThemeProvider theme={buildTheme(mode)}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route
                    element={<AppShell mode={mode} onToggleMode={handleToggleMode} />}
                  >
                    <Route index element={<GalleryPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route element={<RequireRole role="editor" />}>
                      <Route path="/admin/imports" element={<AdminImportsPage />} />
                    </Route>
                    <Route element={<RequireRole role="admin" />}>
                      <Route path="/admin/users" element={<AdminUsersPage />} />
                      <Route path="/admin/server" element={<AdminServerPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
