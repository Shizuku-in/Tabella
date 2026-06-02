import { alpha, createTheme } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'

export function buildTheme(mode: PaletteMode) {
  const isDark = mode === 'dark'
  const primaryMain = isDark ? '#8ea0ff' : '#31489f'
  const primaryLight = isDark ? '#b8c4ff' : '#4c63bf'
  const defaultBackground = isDark ? '#0c0d11' : '#f3f4f8'
  const paperBackground = isDark ? '#15171d' : '#ffffff'
  const borderColor = isDark ? '#252934' : '#d9dfec'
  const mutedText = isDark ? '#9aa4ba' : '#596378'

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain,
        light: primaryLight,
      },
      background: {
        default: defaultBackground,
        paper: paperBackground,
      },
      divider: borderColor,
      text: {
        primary: isDark ? '#f4f7ff' : '#141b2d',
        secondary: mutedText,
      },
    },
    shape: {
      borderRadius: 8,
    },
    typography: {
      fontFamily: '"Manrope Variable", "Segoe UI", sans-serif',
      h1: {
        fontSize: '2rem',
        fontWeight: 700,
      },
      h2: {
        fontSize: '1.35rem',
        fontWeight: 700,
      },
      h3: {
        fontSize: '1rem',
        fontWeight: 700,
      },
      body1: {
        fontSize: '0.96rem',
      },
      body2: {
        fontSize: '0.88rem',
      },
      caption: {
        fontSize: '0.75rem',
      },
      button: {
        fontWeight: 600,
        textTransform: 'none',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: defaultBackground,
            transition: 'background-color 150ms ease, color 150ms ease',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(paperBackground, 0.84),
            borderBottom: `1px solid ${borderColor}`,
            boxShadow: 'none',
            backdropFilter: 'blur(16px)',
            transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${borderColor}`,
            transition:
              'background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 38,
            paddingInline: 14,
            boxShadow: 'none',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
          input: {
            paddingTop: 10,
            paddingBottom: 10,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          size: 'small',
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          grouped: {
            borderRadius: 8,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            paddingInline: 14,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
          },
          list: {
            paddingTop: 4,
            paddingBottom: 4,
          },
        },
      },
    },
  })
}
