/**
 * Hard refresh, scoped to Nishchit. The site shares its origin with the rest of the portfolio,
 * so this only touches what belongs to Nishchit:
 *   - Cache Storage entries whose name mentions nishchit (none today, future-proof),
 *   - localStorage / sessionStorage keys starting with "nishchit",
 *   - the browser HTTP cache for every file this page loaded from under /nishchit/
 *     (re-fetched with cache: 'reload', which overwrites the stored copy),
 * then reloads the page. The search in the URL is kept so the user lands back where they were.
 */
export async function hardRefresh(button) {
  if (button) {
    button.disabled = true;
    button.classList.add('is-spinning');
    button.setAttribute('aria-busy', 'true');
  }
  try {
    await Promise.allSettled([clearCacheStorage(), refetchPageAssets()]);
    clearStorage(globalThis.localStorage);
    clearStorage(globalThis.sessionStorage);
  } finally {
    location.reload();
  }
}

async function clearCacheStorage() {
  if (!globalThis.caches?.keys) return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => /nishchit/i.test(n)).map((n) => caches.delete(n)));
}

function clearStorage(store) {
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key?.toLowerCase().startsWith('nishchit')) store.removeItem(key);
    }
  } catch {
    /* storage blocked (private mode): nothing to clear */
  }
}

/** Same-origin files under this app's folder: HTML, CSS, JS modules, icons. */
function refetchPageAssets() {
  const scope = new URL('./', location.href).href;
  const urls = new Set([location.href.split('#')[0]]);
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.startsWith(scope)) urls.add(entry.name);
  }
  return Promise.allSettled([...urls].map((url) => fetch(url, { cache: 'reload', credentials: 'same-origin' })));
}
