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
    <Link
      key={tech.name}
      href={tech.url}
      target="_blank"
      rel="noopener"
      underline="none"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        opacity: 0.85,
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
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {tech.name}
      </Typography>
    </Link>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        About
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} alignItems="center" sx={{ pt: 1, pb: 1 }}>
          <Stack spacing={1} alignItems="center">
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
            <Typography variant="body2" color="text.secondary" textAlign="center">
              A high-performance, self-hosted gallery.
            </Typography>
          </Stack>

          <Box sx={{ width: '100%', textAlign: 'center', mt: 1 }}>
            <Typography variant="overline" color="text.disabled" sx={{ display: 'block', mb: 1.5, letterSpacing: 1.5, lineHeight: 1 }}>
              TECH STACK
            </Typography>
            <Stack spacing={1.5} alignItems="center">
              <Stack direction="row" justifyContent="center" gap={3}>
                {BACKEND_STACK.map(renderTechItem)}
              </Stack>
              <Stack direction="row" justifyContent="center" gap={2.5}>
                {FRONTEND_STACK.map(renderTechItem)}
              </Stack>
            </Stack>
          </Box>

          <Stack spacing={1} alignItems="center" sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Version: 0.1.0
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
