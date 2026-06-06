import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Link,
  Box,
  useTheme,
} from '@mui/material'
import { GitHub } from '@mui/icons-material'
import pkg from '../../package.json'

export interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

interface TechItem {
  name: string
  logo: string
  color: string
  url: string
}

const BACKEND_STACK: TechItem[] = [
  { name: 'Rust', logo: 'rust', color: '000000', url: 'https://www.rust-lang.org/' },
  { name: 'PostgreSQL', logo: 'postgresql', color: '4169E1', url: 'https://www.postgresql.org/' },
]

const FRONTEND_STACK: TechItem[] = [
  { name: 'React', logo: 'react', color: '61DAFB', url: 'https://react.dev/' },
  { name: 'Vite', logo: 'vite', color: '646CFF', url: 'https://vitejs.dev/' },
  { name: 'MUI', logo: 'mui', color: '007FFF', url: 'https://mui.com/' },
]

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const renderTechItem = (tech: TechItem) => (
    <Box
      key={tech.name}
      onClick={() => window.open(tech.url, '_blank', 'noopener')}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        opacity: 0.85,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        '&:hover': { opacity: 1 },
      }}
    >
      <img
        src={`/icons/${tech.logo}.svg`}
        alt={tech.name}
        style={{
          width: 16,
          height: 16,
          filter: tech.name === 'Rust' && isDark ? 'invert(1)' : 'none',
        }}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {tech.name}
      </Typography>
    </Box>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        About
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1, pb: 1, alignItems: 'center' }}>
          <Stack spacing={1} sx={{ alignItems: 'center' }}>
            <Typography
 variant="h4"
 sx={{
 fontFamily: '"Google Sans Code", monospace',
 fontStyle: 'italic',
 fontWeight: 700,
 color: 'primary.main',
 }}
>
              Tabella
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
              A high-performance, self-hosted gallery.
            </Typography>
          </Stack>

          <Box sx={{ width: '100%', textAlign: 'center', mt: 1 }}>
            <Typography variant="overline" sx={{ color: 'text.disabled', display: 'block', mb: 1.5, letterSpacing: 1.5, lineHeight: 1 }}>
              TECH STACK
            </Typography>
            <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
              <Stack direction="row" sx={{ gap: 3, justifyContent: 'center' }}>
                {BACKEND_STACK.map(renderTechItem)}
              </Stack>
              <Stack direction="row" sx={{ gap: 2.5, justifyContent: 'center' }}>
                {FRONTEND_STACK.map(renderTechItem)}
              </Stack>
            </Stack>
          </Box>

          <Stack spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Version: {pkg.version}
            </Typography>
            <Link 
              href="https://github.com/Shizuku-in/Tabella" 
              target="_blank" 
              rel="noopener" 
              sx={{ 
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              <GitHub fontSize="small" />
              View Source
            </Link>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  )
}
