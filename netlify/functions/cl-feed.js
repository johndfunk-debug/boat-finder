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

    // ── Strategy 1: Extract JSON-LD structured data ──
    // CL embeds a <script id="ld_searchpage_results" type="application/ld+json"> tag
    const jsonLdMatch = html.match(
      /<script[^>]+id\s*=\s*["']ld_searchpage_results["'][^>]*>([\s\S]*?)<\/script>/i
    );

    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        const items = jsonLd.itemListElement || [];
        const listings = items.map((entry) => {
          const item = entry.item || entry;
          const offers = item.offers || {};
          const loc = offers.availableAtOrFrom || {};
          const addr = loc.address || {};
          const images = item.image || [];
          return {
            title: item.name || "",
            url: item.url || "",
            price: offers.price ? `$${Number(offers.price).toLocaleString()}` : "",
            priceNum: offers.price ? Number(offers.price) : null,
            date: item.datePosted || "",
            location: addr.addressLocality || "",
            image: Array.isArray(images) && images.length > 0 ? images[0] : (typeof images === "string" ? images : ""),
          };
        });
        return new Response(JSON.stringify({ listings, method: "json-ld" }), {
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

    // ── Strategy 2: Parse the HTML result cards ──
    const listings = [];
    const resultPattern =
      /<li[^>]*class="[^"]*cl-search-result[^"]*"[^>]*data-pid="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = resultPattern.exec(html)) !== null) {
      const pid = match[1];
      const block = match[2];

      const titleMatch = block.match(/<a[^>]*class="[^"]*posting-title[^"]*"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const title = titleMatch ? titleMatch[2].replace(/<[^>]*>/g, "").trim() : "";
      const linkUrl = titleMatch ? titleMatch[1] : "";

      const priceMatch = block.match(/<span[^>]*class="[^"]*priceinfo[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        || block.match(/\$[\d,]+/);
      let price = "";
      let priceNum = null;
      if (priceMatch) {
        const raw = priceMatch[1] || priceMatch[0];
        const cleaned = raw.replace(/<[^>]*>/g, "").trim();
        price = cleaned;
        const numMatch = cleaned.match(/[\d,]+/);
        if (numMatch) priceNum = parseInt(numMatch[0].replace(/,/g, ""), 10);
      }

      const locMatch = block.match(/<span[^>]*class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const location = locMatch ? locMatch[1].replace(/<[^>]*>/g, "").trim() : "";

      const dateMatch = block.match(/datetime="([^"]*)"/i);
      const date = dateMatch ? dateMatch[1] : "";

      if (title || linkUrl) {
        listings.push({ title, url: linkUrl, price, priceNum, date, location, image: "", pid });
      }
    }

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
