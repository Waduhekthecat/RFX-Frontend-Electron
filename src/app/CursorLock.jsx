import { useEffect } from "react";

const STYLE_ID = "cursor-lock";
const CSS = `*, *::before, *::after { cursor: none !important; user-select: none !important; -webkit-user-select: none !important; }`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function CursorLock() {
  useEffect(() => {
    injectStyle();
    document.documentElement.style.cursor = "none";
    document.body.style.cursor = "none";

    return () => {
      document.getElementById(STYLE_ID)?.remove();
      document.documentElement.style.cursor = "";
      document.body.style.cursor = "";
    };
  }, []);

  return null;
}

// Export this so Nav can call it after navigation
export function reassertCursorLock() {
  const el = document.getElementById(STYLE_ID);
  if (el) {
    el.textContent = "";
    el.textContent = CSS;
  } else {
    injectStyle();
  }
  document.documentElement.style.cursor = "none";
  document.body.style.cursor = "none";
}