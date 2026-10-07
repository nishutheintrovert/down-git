# Git Directory Downloader

A lightweight, client-side web application to download specific directories from public GitHub repositories as ZIP archives.

## How It Works

- **Zero Backend:** Runs entirely in the browser.
- **Client-Side Processing:** Avoids server-side rate limits by using the visitor's IP for GitHub API requests.
- **On-the-Fly Zipping:** Uses [JSZip](https://stuk.github.io/jszip/) to fetch raw files concurrently and compile them directly in the browser's memory.

## Local Development

No build step required. Run any local web server to bypass CORS restrictions:

```bash
# Using Node.js
npx serve .

# Using Python
python -m http.server
```
