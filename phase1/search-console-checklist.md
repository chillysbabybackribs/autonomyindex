# Search Console Checklist

1. Verify domain property
- Add `autonomyindex.io` as a Domain property in Google Search Console.
- Add DNS TXT verification record at your DNS provider.
- Confirm verification status is green before submitting sitemap.

2. Submit sitemap
- Open Search Console -> Sitemaps.
- Submit `https://autonomyindex.io/sitemap.xml`.
- Confirm `Success` and monitor discovered URL count.

3. Inspect live URLs
- Run URL Inspection for:
  - `https://autonomyindex.io/`
  - `https://autonomyindex.io/agents-2026`
  - `https://autonomyindex.io/methodology`
  - `https://autonomyindex.io/daily-signals`
  - One weekly brief URL (for Article schema validation)
- Click `Test Live URL` and request indexing for key pages.

4. Monitor coverage
- Check Indexing -> Pages for:
  - `Crawled - currently not indexed`
  - `Duplicate without user-selected canonical`
  - `Excluded by robots.txt`
- Ensure intentional blocks are limited to `/api/`, `/logs/`, `/data/index-history/`, `/data/deltas/`.

5. Validate enhancements
- In URL Inspection, confirm detected structured data:
  - `Organization` on core pages
  - `Dataset` on `/agents-2026`, `/methodology`, `/daily-signals`
  - `Article` on `/weekly-briefs/{report_id}` pages

6. Ongoing operations (daily rhythm)
- Keep daily workflow active at 13:30 UTC.
- Confirm weekly brief route generation + sitemap generation step succeeds on each publish.
- Recheck coverage and schema warnings weekly.
