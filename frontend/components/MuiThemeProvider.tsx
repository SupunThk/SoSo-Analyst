'use client';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';

const terminalTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00FF9D',
      contrastText: '#030503',
    },
    secondary: {
      main: '#00D4FF',
    },
    warning: {
      main: '#FFB800',
    },
    error: {
      main: '#FF4444',
    },
    background: {
      default: '#050505',
      paper: '#060A06',
    },
    text: {
      primary: '#E0E0E0',
      secondary: '#7B8A7B',
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
    button: {
      fontFamily: 'var(--font-ibm-plex-mono), monospace',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          minHeight: 32,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontWeight: 700,
          letterSpacing: '0.08em',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#081008',
          border: '1px solid rgba(0, 255, 157, 0.28)',
          color: '#E0E0E0',
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.04em',
        },
      },
    },
  },
});

export function MuiThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={terminalTheme}>{children}</ThemeProvider>;
}
