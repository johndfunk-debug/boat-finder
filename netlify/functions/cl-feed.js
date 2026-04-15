// Netlify serverless function — fetches Craigslist search pages and extracts
// the embedded JSON-LD structured data from search results.
//
// Called by the frontend: /.netlify/functions/cl-feed?city=sfbay&query=sailboat

export default async (req) => {
  const url = new URL(req.url);
  const city = url.searchParams.get("city");
  const query = url.searchParams.get("query");
  const minPrice = url.searchParams.get("min_price") || "";
  const maxPrice = url.searchParams.get("max_price") || "";

  if (!city || !query) {
    return new Response(JSON.stringify({ error: "city and query params required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Build the CL search URL — boats category is "boo"
  let clUrl = `https://${encodeURIComponent(city)}.craigslist.org/search/boo?query=${encodeURIComponent(query)}`;
  if (minPrice) clUrl += `&min_price=${encodeURIComponent(minPrice)}`;
  if (maxPrice) clUrl += `&max_price=${encodeURIComponent(maxPrice)}`;

  try {
    const res = await fetch(clUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `CL returned ${res.status}`, listings: [] }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const html = await res.text();
    const baseUrl = `https://${encodeURIComponent(city)}.craigslist.org`;

    // ── Extract links and dates from HTML result cards ──
    // These have the actual URLs and post dates that JSON-LD lacks
    const htmlLinks = [];
    const cardPattern = /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let cardMatch;
    while ((cardMatch = cardPattern.exec(html)) !== null) {
      const pid = cardMatch[1];
      const block = cardMatch[2];
      const hrefMatch = block.match(/<a[^>]*href="([^"]*\/(\d+)\.html)"/i);
      const dateMatch = block.match(/datetime="([^"]*)"/i);
      const titleMatch = block.match(/<span[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      htmlLinks.push({
        pid,
        url: hrefMatch ? hrefMatch[1] : "",
        date: dateMatch ? dateMatch[1] : "",
        title,
      });
    }

    // ── Strategy 1: Extract JSON-LD structured data + merge with HTML links ──
    const jsonLdMatch = html.match(
      /<script[^>]+id\s*=\s*["']ld_searchpage_results["'][^>]*>([\s\S]*?)<\/script>/i
    );

    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        const items = jsonLd.itemListElement || [];
        const listings = items.map((entry, idx) => {
          const item = entry.item || entry;
          const offers = item.offers || {};
          const loc = offers.availableAtOrFrom || {};
          const addr = loc.address || {};
          const images = item.image || [];

          // Match to HTML card by index (they're in the same order)
          // or by title similarity as fallback
          const htmlCard = htmlLinks[idx] || {};

          // Build URL: prefer HTML-extracted URL, then item.url, then nothing
          let listingUrl = item.url || htmlCard.url || "";
          // Make relative URLs absolute
          if (listingUrl && !listingUrl.startsWith("http")) {
            listingUrl = baseUrl + listingUrl;
          }

          return {
            title: item.name || htmlCard.title || "",
            url: listingUrl,
            price: offers.price ? `$${Number(offers.price).toLocaleString()}` : "",
            priceNum: offers.price ? Number(offers.price) : null,
            date: htmlCard.date || item.datePosted || "",
            location: addr.addressLocality || "",
            image: Array.isArray(images) && images.length > 0 ? images[0] : (typeof images === "string" ? images : ""),
            pid: htmlCard.pid || "",
          };
        });
        return new Response(JSON.stringify({ listings, method: "json-ld+html" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e) {
        // JSON-LD parse failed, fall through to Strategy 2
      }
    }

    // ── Strategy 2: Use HTML-only data if JSON-LD wasn't available ──
    const listings = htmlLinks.map((card) => {
      const priceMatch = card.title.match(/\$[\d,]+/);
      let url = card.url;
      if (url && !url.startsWith("http")) url = baseUrl + url;
      return {
        title: card.title,
        url: url,
        price: priceMatch ? priceMatch[0] : "",
        priceNum: priceMatch ? parseInt(priceMatch[0].replace(/[$,]/g, ""), 10) : null,
        date: card.date,
        location: "",
        image: "",
        pid: card.pid,
      };
    });

    if (listings.length === 0 && !jsonLdMatch) {
      return new Response(
        JSON.stringify({
          listings: [],
          method: "none",
          debug: `Page fetched (${html.length} chars) but no listings parsed. May be CAPTCHA or blocked.`,
          snippet: html.substring(0, 500),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    return new Response(JSON.stringify({ listings, method: "html-parse" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message || "fetch failed", listings: [] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
};

export const config = {
  path: "/.netlify/functions/cl-feed",
};
