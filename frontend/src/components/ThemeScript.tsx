/**
 * Runs before React paint: applies `data-theme` from localStorage + system preference.
 * Must stay in sync with `resolveThemePreference` in `src/theme/resolveTheme.ts`.
 */
export function ThemeScript() {
  const code = `
(function(){
  try {
    var k=${JSON.stringify('memoon-theme')};
    var stored=localStorage.getItem(k);
    var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved;
    if(stored==='light'||stored==='dark'||stored==='monokai'){resolved=stored;}
    else{resolved=dark?'dark':'light';}
    document.documentElement.setAttribute('data-theme',resolved);
  }catch(e){
    document.documentElement.setAttribute('data-theme','light');
  }
})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
