import { ErrorOutlined, HomeOutlined } from '@mui/icons-material'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router-dom'

import { ROUTES } from '../lib/routes.ts'

export function NotFoundPage() {
  const { t } = useTranslation()
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
        sx={{
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: 400,
          p: 5,
        }}
      >
        <ErrorOutlined sx={{ fontSize: 96, color: 'text.secondary', opacity: 0.8 }} />

        <Stack spacing={1}>
          <Typography variant="h1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            404
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            {t('common.notFound.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('common.notFound.description')}
          </Typography>
        </Stack>

        <Button
          component={RouterLink}
          to={ROUTES.HOME}
          variant="outlined"
          size="large"
          startIcon={<HomeOutlined />}
          sx={{ mt: 2, borderRadius: 1, textTransform: 'none', px: 4 }}
        >
          {t('common.notFound.back')}
        </Button>
      </Stack>
    </Box>
  )
}
