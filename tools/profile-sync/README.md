# Viewer sync (Cloudflare Worker + D1)

The Stremio account has one library, and dx.bi keeps it apart per viewer. This Worker lets a device know what's already been decided on another: without it, a title one viewer watched on the TV lands on the first viewer on the computer.

It keeps, per Stremio account:

- the viewers (names, colours, kids ages)
- who owns which library title
- each viewer's hidden titles, Continue Watching removals and Home layout
- the titles allowed on kids profiles

It's only used by signed-in accounts with two or more viewers on the device, and *Keep viewers the same on every device* in dx.bi's settings turns it off. There's no account to make. A device sends its Stremio session key, the Worker asks Stremio whose it is (`POST api.strem.io/api/getUser`) and files the data under that account's id. The key is never stored or logged: only a hash of it, in memory, for 10 minutes.

The parental PIN, watch stats, playback positions, addon lists, stream links and caches are never sent.

Limits: 1 MB per account, 100 KB per value, 200 entries per request, 60 requests a minute per address and 30 per account.

## Set up

```sh
cd tools/profile-sync
npx wrangler@4.154.0 login
npx wrangler@4.154.0 d1 create dxbi-sync     # put the database_id in wrangler.toml
npx wrangler@4.154.0 d1 execute dxbi-sync --remote --file schema.sql
npx wrangler@4.154.0 deploy
```

`node tools/profile-sync/test.mjs` runs the Worker without Cloudflare, on Node's SQLite. Viewer sync comes from Nathflix by Lavagnou (GPL-3.0).
