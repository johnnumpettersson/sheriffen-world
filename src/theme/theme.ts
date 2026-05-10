import { createTheme, responsiveFontSizes } from "@mui/material/styles";
import { raccoonPalette } from "./palette";

export function getAppTheme() {
  let theme = createTheme({
    palette: raccoonPalette,
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: ["Segoe UI", "Inter", "Roboto", "Arial", "sans-serif"].join(
        ",",
      ),
      h1: {
        fontWeight: 700,
        letterSpacing: "-0.02em",
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            margin: 0,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            minHeight: 42,
          },
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);

  return theme;
}
