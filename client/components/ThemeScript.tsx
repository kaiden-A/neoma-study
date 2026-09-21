const THEME_SCRIPT = `try{var t=localStorage.getItem("neoma.theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

// Runs before paint so a stored theme never flashes the wrong way.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
