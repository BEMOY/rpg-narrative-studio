import { Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] text-[var(--op-50)] hover:text-[var(--op-90)] transition-colors shrink-0"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
