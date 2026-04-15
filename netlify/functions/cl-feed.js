export default async (req) => {
  const url = new URL(req.url);
  const city = url.searchParams.get("city");
  const query = url.searchParams.get("query");
  const minPrice = url.searchParams.get("min_price") || "";
  const maxPrice = url.searchParams.get("max_price") || "";
  if (!city || !query) {
    return new Response(JSON.stringify({ error: "need city and query" }), {
      status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
  let clUrl = `https://${encodeURIComponent(city)}.craigslist.org/search/boo?query=${encodeURIComponent(query)}`;
  if (minPrice) clUrl += `&min_price=${encodeURIComponent(minPrice)}`;
  if (maxPrice) clUrl += `&max_price=${encodeURIComponent(maxPrice)}`;
  try {
    const res = await fetch(clUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: res.status, listings: [] }), {
        status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    const html = await res.text();
    const base = `https://${encodeURIComponent(city)}.craigslist.org`;

    // Extract all href links that point to individual listings (/area/cat/id.html)
    const hrefs = [];
    const hrefRe = /href="(\/[^"]*?\/d\/[^"]*?\/(\d+)\.html)"/gi;
    let hm;
    while ((hm = hrefRe.exec(html)) !== null) {
      hrefs.push({ path: hm[1], pid: hm[2] });
    }

    // Also try broader pattern if the /d/ pattern didn't match
    if (hrefs.length === 0) {
      const hrefRe2 = /href="(\/[^"]*?(\d{9,})\.html)"/gi;
      while ((hm = hrefRe2.exec(html)) !== null) {
        hrefs.push({ path: hm[1], pid: hm[2] });
      }
    }

    // Extract JSON-LD
    const jsonLdM = html.match(/<script[^>]+id\s*=\s*["']ld_searchpage_results["'][^>]*>([\s\S]*?)<\/script>/i);

    if (jsonLdM) {
      try {
        const jd = JSON.parse(jsonLdM[1]);
        const items = jd.itemListElement || [];
        const listings = items.map((e, i) => {
          const it = e.item || e;
          const of2 = it.offers || {};
          const ad = (of2.availableAtOrFrom || {}).address || {};
          const imgs = it.image || [];
          const h = hrefs[i] || {};
          let u = it.url || (h.path ? base + h.path : "");
          if (u && !u.startsWith("http")) u = base + u;
          return {
            title: it.name || "",
            url: u,
            price: of2.price ? "$" + Number(of2.price).toLocaleString() : "",
            priceNum: of2.price ? Number(of2.price) : null,
            date: it.datePosted || "",
            location: ad.addressLocality || "",
            image: Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : "",
            pid: h.pid || ""
          };
        });
        return new Response(JSON.stringify({
          listings,
          method: "json-ld",
          hrefCount: hrefs.length,
          sampleHrefs: hrefs.slice(0, 3)
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        // fall through
      }
    }

    // Fallback: return debug info
    return new Response(JSON.stringify({
      listings: [],
      method: "none",
      hrefCount: hrefs.length,
      sampleHrefs: hrefs.slice(0, 5),
      htmlSnippet: html.substring(0, 800)
    }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, listings: [] }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
export const config = { path: "/.netlify/functions/cl-feed" };
