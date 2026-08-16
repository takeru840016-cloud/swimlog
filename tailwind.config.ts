import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"], theme: { extend: { colors: { ink: "#0b1729", pool: "#1173b8", foam: "#eaf7ff" } } }, plugins: [] } satisfies Config;
