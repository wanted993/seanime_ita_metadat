/// <reference path="./core.d.ts" />

// ---------------------------------------------------------------------------
// Traduttore Italiano Descrizioni Anime
// ---------------------------------------------------------------------------
// Fonti (in ordine di priorità):
//   1. Wikipedia IT   -> estratto della voce dell'anime, se esiste
//   2. MyMemory        -> traduzione automatica della description originale
// Cache: $storage, chiave "desc.<mediaId>", per non richiamare le API ad
// ogni apertura della pagina.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = "desc."
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 giorni

function init() {

  $app.onGetAnime(async (e) => {
    e.anime.description = "TEST ITALIANO";
    try {
      if (!e.anime) { e.next(); return }

      const mediaId = e.anime.id
      const cacheKey = CACHE_PREFIX + mediaId

      // 1. Controlla la cache
      const cached = $storage.get(cacheKey)
      if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
        e.anime.description = cached.text
        e.next()
        return
      }

      // 2. Prova Wikipedia IT
      const title = e.anime.title?.romaji || e.anime.title?.english || e.anime.title?.native
      let translated = title ? await fetchFromWikipediaIT(title) : null

      // 3. Fallback: MyMemory sulla description originale (inglese)
      if (!translated && e.anime.description) {
        translated = await fetchFromMyMemory(stripHtml(e.anime.description))
      }

      if (translated) {
        e.anime.description = translated
        $storage.set(cacheKey, { text: translated, ts: Date.now() })
      }
    } catch (err) {
      console.error("[it-anime-translate] errore onGetAnime:", err)
      // in caso di errore non blocchiamo la catena, si mantiene la description originale
    } finally {
      e.next()
    }
  })

  $app.onGetAnimeDetails(async (e) => {
    try {
      if (!e.anime) { e.next(); return }

      const mediaId = e.anime.id
      const cacheKey = CACHE_PREFIX + mediaId

      const cached = $storage.get(cacheKey)
      if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
        e.anime.description = cached.text
        e.next()
        return
      }

      const title = e.anime.title?.romaji || e.anime.title?.english || e.anime.title?.native
      let translated = "TEST WIKIPEDIA"

      if (!translated && e.anime.description) {
        translated = await fetchFromMyMemory(stripHtml(e.anime.description))
      }

      if (translated) {
        e.anime.description = translated
        $storage.set(cacheKey, { text: translated, ts: Date.now() })
      }
    } catch (err) {
      console.error("[it-anime-translate] errore onGetAnimeDetails:", err)
    } finally {
      e.next()
    }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Cerca la voce su Wikipedia IT e ne restituisce l'estratto (trama/descrizione)
async function fetchFromWikipediaIT(title) {
  try {
    const searchUrl = "https://it.wikipedia.org/w/api.php"
      + "?action=query&list=search&format=json&srlimit=1"
      + "&srsearch=" + encodeURIComponent(title + " anime")

    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()
    const hit = searchData?.query?.search?.[0]
    if (!hit) return null

    const extractUrl = "https://it.wikipedia.org/w/api.php"
      + "?action=query&prop=extracts&exintro=1&explaintext=1&format=json"
      + "&pageids=" + hit.pageid

    const extractRes = await fetch(extractUrl)
    const extractData = await extractRes.json()
    const page = extractData?.query?.pages?.[hit.pageid]
    const extract = page?.extract?.trim()

    if (!extract || extract.length < 40) return null // scarta stub troppo corti
    return extract
  } catch (err) {
    console.error("[it-anime-translate] Wikipedia IT fallita:", err)
    return null
  }
}

// Traduce un testo inglese in italiano tramite l'API gratuita MyMemory
async function fetchFromMyMemory(text) {
  if (!text) return null
  try {
    // MyMemory limita ~500 caratteri per richiesta gratuita: tronchiamo se serve
    const chunk = text.length > 480 ? text.slice(0, 480) : text

    const url = "https://api.mymemory.translated.net/get"
      + "?q=" + encodeURIComponent(chunk)
      + "&langpair=en|it"

    const res = await fetch(url)
    const data = await res.json()
    const translated = data?.responseData?.translatedText

    if (!translated || data?.responseStatus !== 200) return null
    return translated
  } catch (err) {
    console.error("[it-anime-translate] MyMemory fallita:", err)
    return null
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}
