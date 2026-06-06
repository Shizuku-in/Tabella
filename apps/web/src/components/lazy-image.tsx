import { BrokenImage } from '@mui/icons-material'
import { Box, CircularProgress, keyframes } from '@mui/material'
import { useState } from 'react'

const slideUpFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

interface LazyImageProps {
  src?: string
  alt?: string
  aspectRatio?: string | number
  className?: string
}

export function LazyImage({ src, alt, aspectRatio, className }: LazyImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <Box
      className={className}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        backgroundColor: 'rgba(17, 20, 29, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {status === 'loading' && (
        <CircularProgress size={32} sx={{ color: 'text.secondary', position: 'absolute' }} />
      )}

      {status === 'error' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'action.disabledBackground',
          }}
        >
          <BrokenImage sx={{ color: 'text.disabled', fontSize: 48 }} />
        </Box>
      )}

      {src && status !== 'error' && (
        <Box
          component="img"
          src={src}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: status === 'loaded' ? 1 : 0,
            animation:
              status === 'loaded'
                ? `${slideUpFadeIn} 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) forwards`
                : 'none',
          }}
        />
      )}
    </Box>
  )
}
