/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
colors: {
  primary: "#0F172A",       // navy
  primaryDark: "#020617",

  secondary: "#EAB308",     // gold
  secondaryLight: "#FACC15",
  secondarySoft: "#FEF9C3",

  background: "#FAFAFA",
  surface: "#FFFFFF",
  soft: "#F8FAFC",

  text: "#0F172A",
  muted: "#64748B",
  border: "#E5E7EB",
},
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
      },
    },
  },
  plugins: [],
};
