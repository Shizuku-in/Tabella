/**
 * Utility component to display full-screen loading indicators or centered message states.
 */

import { CircularProgress, Stack, Typography } from '@mui/material'

interface FullscreenStateProps {
  title: string
  description?: string
}

export function FullscreenState({ title, description }: FullscreenStateProps) {
  return (
    <Stack
      spacing={2}
      sx={{
        minHeight: '100vh',
        px: 3,
        textAlign: 'center',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress size={28} />
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {description ? <Typography sx={{ color: 'text.secondary' }}>{description}</Typography> : null}
    </Stack>
  )
}
