import type { PaletteMode } from '@mui/material'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { startTransition, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AppShell from './app-shell.tsx'
import { AuthProvider } from './auth/auth-provider.tsx'
import { RequireAuth, RequireRole } from './auth/route-guards.tsx'
import { ReloadPrompt } from './components/ReloadPrompt.tsx'
import { ROUTES } from './lib/routes.ts'
import { AdminImportsPage } from './pages/admin-imports-page.tsx'
import { AdminServerPage } from './pages/admin-server-page.tsx'
import { AdminUsersPage } from './pages/admin-users-page.tsx'
import { GalleryPage } from './pages/gallery-page.tsx'
import { LoginPage } from './pages/login-page.tsx'
import { NotFoundPage } from './pages/not-found-page.tsx'
import { ProfilePage } from './pages/profile-page.tsx'
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
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
                <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell mode={mode} onToggleMode={handleToggleMode} />}>
                    <Route index element={<GalleryPage />} />
                    <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
                    <Route element={<RequireRole role="editor" />}>
                      <Route path={ROUTES.ADMIN_IMPORTS} element={<AdminImportsPage />} />
                    </Route>
                    <Route element={<RequireRole role="admin" />}>
                      <Route path={ROUTES.ADMIN_USERS} element={<AdminUsersPage />} />
                      <Route path={ROUTES.ADMIN_SERVER} element={<AdminServerPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
            <ReloadPrompt />
          </AuthProvider>
        </QueryClientProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
