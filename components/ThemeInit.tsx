// Sets `data-theme` on <html> from localStorage before the page paints, so an explicit light/dark
// choice (see ThemeToggle) doesn't flash the wrong theme for a frame on load. Plain inline script
// rather than a client-component effect, since an effect would run after first paint.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
`;

export default function ThemeInit() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
