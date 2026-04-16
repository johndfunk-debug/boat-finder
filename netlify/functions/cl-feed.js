export default async (req) => {
  const url = new URL(req.url);
  const city = url.searchParams.get("city");
  const query = url.searchParams.get("query");
  const cat = url.searchParams.get("cat") || "boo";
  const minPrice = url.searchParams.get("min_price") || "";
  const maxPrice = url.searchParams.get("max_price") || "";
  if (!city || !query) {
    return new Response(JSON.stringify({ error: "need city and query" }), {
      status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
  let clUrl = `https://${encodeURIComponent(city)}.craigslist.org/search/${encodeURIComponent(cat)}?query=${encodeURIComponent(query)}`;
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

    // Extract JSON-LD
    const jsonLdM = html.match(/<script[^>]+id\s*=\s*["']ld_searchpage_results["'][^>]*>([\s\S]*?)<\/script>/i);

    if (jsonLdM) {
      try {
        const jd = JSON.parse(jsonLdM[1]);
        const items = jd.itemListElement || [];
        const listings = items.map((e) => {
          const it = e.item || e;
          const of2 = it.offers || {};
          const ad = (of2.availableAtOrFrom || {}).address || {};
          const imgs = it.image || [];
          // Build a search URL on that city's CL to find this exact listing
          const searchUrl = `${base}/search/${encodeURIComponent(cat)}?query=${encodeURIComponent(it.name || "")}`;
          return {
            title: it.name || "",
            url: it.url || searchUrl,
            price: of2.price ? "$" + Number(of2.price).toLocaleString() : "",
            priceNum: of2.price ? Number(of2.price) : null,
            date: it.datePosted || "",
            location: ad.addressLocality || "",
            image: Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : "",
          };
        });
        return new Response(JSON.stringify({ listings, method: "json-ld" }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        // fall through
      }
    }

    return new Response(JSON.stringify({
      listings: [],
      method: "none",
      htmlLen: html.length
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
