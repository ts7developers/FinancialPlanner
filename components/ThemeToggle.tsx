"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

function getSnapshot(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Always "light" for the server-rendered/pre-hydration pass — this class of value (real theme
// can only be known in the browser) is exactly what useSyncExternalStore's server snapshot is
// for, avoiding a hydration mismatch without setting state from an effect.
function getServerSnapshot(): "light" | "dark" {
  return "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener("theme-change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("theme-change", onChange);
  };
}

/** Toggles between light and dark, persisting the explicit choice — defaults to matching the
 * system preference (see ThemeInit) until the user picks one. */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing / storage blocked — theme still applies for this session, just won't persist.
    }
    window.dispatchEvent(new Event("theme-change"));
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        background: "rgba(255,255,255,.08)",
        border: "1px solid rgba(255,255,255,.16)",
        borderRadius: 8,
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
