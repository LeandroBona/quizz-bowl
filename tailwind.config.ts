import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
      card: "hsl(var(--card))", border: "hsl(var(--border))",
      primary: "hsl(var(--primary))", muted: "hsl(var(--muted))",
      "muted-foreground": "hsl(var(--muted-foreground))"
    },
    fontFamily: { sans: ["Arial", "Helvetica", "sans-serif"] }
  } },
  plugins: []
} satisfies Config;
