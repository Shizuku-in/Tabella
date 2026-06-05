import { Box, Button, Stack, Typography } from '@mui/material'
import { ErrorOutline, HomeOutlined } from '@mui/icons-material'
import { Link as RouterLink } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Stack
        spacing={3}
        alignItems="center"
        textAlign="center"
        sx={{
          maxWidth: 400,
          p: 5,
        }}
      >
        <ErrorOutline sx={{ fontSize: 96, color: 'text.secondary', opacity: 0.8 }} />
        
        <Stack spacing={1}>
          <Typography variant="h1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            404
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Page Not Found
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            The page you are looking for does not exist, has been removed, or is temporarily unavailable.
          </Typography>
        </Stack>

        <Button
          component={RouterLink}
          to="/"
          variant="outlined"
          size="large"
          startIcon={<HomeOutlined />}
          sx={{ mt: 2, borderRadius: 1, textTransform: 'none', px: 4 }}
        >
          Back
        </Button>
      </Stack>
    </Box>
  )
}
