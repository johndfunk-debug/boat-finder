# Boat Finder

A Craigslist boat listing aggregator that searches across 70+ cities. Built to cut through dealer spam and find rare sailboats (melonseeds, peep hens, and the like).

## Features

- **Multi-city search** — search across 70+ Craigslist regions from West Coast to East Coast
- **Multiple search terms** — comma-separated keywords searched simultaneously
- **Region quick-select** — toggle "nearby", "West Coast", or all cities at once
- **Price filtering** — optional min/max price range
- **New listing badges** — highlights anything posted in the last 24 hours
- **Sort & filter** — sort by date or price, filter by city or search term
- **Dismiss listings** — hide ones you've already seen (persists in localStorage)
- **Netlify serverless proxy** — reliable RSS feed fetching without CORS issues

## Deploy to Netlify

### Option 1: Push to GitHub + connect Netlify

1. Create a new repo on GitHub (e.g. `boat-finder`)
2. Push this project:
   ```bash
   cd boat-finder
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/boat-finder.git
   git push -u origin main
   ```
3. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project"
4. Connect your GitHub repo
5. Deploy settings are auto-detected from `netlify.toml` — just click Deploy

### Option 2: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

## Project structure

```
boat-finder/
├── netlify.toml              # Build config
├── netlify/functions/
│   └── cl-feed.js            # Serverless proxy for CL RSS feeds
├── public/
│   └── index.html            # Frontend app (single file)
└── README.md
```

## How it works

The app sends search requests to a Netlify serverless function (`cl-feed.js`) which proxies Craigslist's RSS feeds. This avoids browser CORS restrictions and keeps things reliable. Results are parsed client-side, deduplicated, and displayed with sorting/filtering controls.

RSS feeds are Craigslist's built-in machine-readable format for listings — the app reads them automatically so you don't have to browse each city manually.
