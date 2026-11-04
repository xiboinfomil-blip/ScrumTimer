'use client';
import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: '#205f9d', dark: '#164b80', light: '#eaf2fc' }, secondary: { main: '#ec8b23', contrastText: '#193752' },
    success: { main: '#147d52' }, error: { main: '#b94b43' }, background: { default: '#f7f8fa', paper: '#ffffff' },
    text: { primary: '#202b36', secondary: '#596979' }, divider: '#dce3e9',
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: '"Aptos", "Trebuchet MS", sans-serif', fontSize: 14, button: { textTransform: 'none', fontWeight: 650, letterSpacing: 0 }, h5: { fontWeight: 750, letterSpacing: 0 }, h6: { fontWeight: 700, letterSpacing: 0 } },
  components: {
    MuiButton: { defaultProps: { disableElevation: true, size: 'small', type: 'button' }, styleOverrides: {
      contained: { '&.MuiButton-colorPrimary': { backgroundColor: '#205f9d', boxShadow: 'none', '&:hover': { backgroundColor: '#164b80', boxShadow: 'none' } } },
      outlined: { borderColor: '#7b8998', backgroundColor: '#ffffff', '&:hover': { borderColor: '#205f9d', backgroundColor: '#eaf2fc' } },
      root: { minHeight: 44, borderRadius: 6, paddingInline: 14, fontSize: 13, transition: 'background-color 180ms ease, box-shadow 180ms ease', '&.Mui-disabled': { color: '#596979', backgroundColor: '#edf0f3', borderColor: '#a4afba' } },
    } },
    MuiIconButton: { defaultProps: { size: 'small' }, styleOverrides: { root: { width: 44, height: 44, borderRadius: 6 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44, color: '#33485c', borderColor: '#7b8998', '&.Mui-selected': { color: '#164b80', backgroundColor: '#eaf2fc', borderColor: '#205f9d', '&:hover': { backgroundColor: '#dce9f7' } } } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: 8, border: '1px solid #dce3e9', boxShadow: 'none' } } },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: 'sm' }, styleOverrides: { paper: { borderRadius: 8, padding: 4, maxHeight: 'calc(100dvh - 32px)', margin: 16 }, container: { backdropFilter: 'blur(3px)' } } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 19, fontWeight: 750, padding: '20px 20px 8px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '12px 20px', fontSize: 13 } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '12px 20px 20px', gap: 8 } } },
    MuiInputBase: { styleOverrides: { root: { fontSize: 14 }, input: { minWidth: 0, '&::placeholder': { color: '#596979', opacity: 1 } } } },
    MuiInputLabel: { styleOverrides: { root: { color: '#475869' } } },
    MuiFormLabel: { styleOverrides: { root: { color: '#475869' } } },
    MuiFormHelperText: { styleOverrides: { root: { color: '#596979', fontSize: 12 } } },
    MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderColor: '#7b8998' }, root: { '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#205f9d' } } } },
    MuiCheckbox: { styleOverrides: { root: { color: '#596979' } } },
    MuiRadio: { styleOverrides: { root: { color: '#596979' } } },
    MuiSwitch: { styleOverrides: { track: { opacity: 1, backgroundColor: '#7b8998' } } },
    MuiButtonBase: { styleOverrides: { root: { '.list-pagination &': { whiteSpace: 'nowrap' }, '&.Mui-focusVisible': { outline: '3px solid #164b80', outlineOffset: 3, boxShadow: '0 0 0 2px #ffffff' } } } },
    MuiNativeSelect: { styleOverrides: { select: { minHeight: 24, borderRadius: 6, padding: '10px 32px 10px 12px', '&:focus': { borderRadius: 6, backgroundColor: '#edf4fc' } } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 4, fontWeight: 650, fontSize: 11 }, sizeSmall: { height: 25 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 6, fontSize: 13, alignItems: 'center' } } },
    MuiCssBaseline: { styleOverrides: { '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animationDuration: '0s !important', transitionDuration: '0s !important', scrollBehavior: 'auto !important' } } } },
  },
});
export function DesignProvider({ children }: { children: ReactNode }) {
  return <AppRouterCacheProvider options={{ enableCssLayer: true }}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></AppRouterCacheProvider>;
}