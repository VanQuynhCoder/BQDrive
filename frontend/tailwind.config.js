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

  background: "#F8FAFC",
  surface: "#FFFFFF",
  soft: "#F1F5F9",

  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
},
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
      },
    },
  },
  plugins: [],
};