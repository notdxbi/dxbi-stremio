# Problem-report relay

dx.bi's *Report a problem* sends reports here (a Cloudflare Worker), and the Worker posts them to a
private Discord channel. The channel's webhook is a secret of the Worker, so it isn't in dx.bi's
code and can be replaced without updating the apps.

What the Worker lets through:

- Only well-formed dx.bi reports (report code, version, where it came from, route, errors list), up
  to 256 KB, from any address at most 3 times a minute.
- The Discord message is written by the Worker from those checked fields. Nothing in it can ping
  anyone, links don't preview, and the full report is attached as a JSON file.

## Set up

From this folder:

```
npx wrangler login
npx wrangler deploy
```

Then add the Discord webhook as a secret: Cloudflare dashboard → *Workers & Pages* → *dxbi-reports*
→ *Settings* → *Variables and Secrets* → *Add* → type *Secret*, name `DISCORD_WEBHOOK`, value = the
webhook URL (Discord: channel → *Edit Channel* → *Integrations* → *Webhooks*).

The apps use `REPORT_ENDPOINT` in `dxbi.plugin.js`: the Worker's address followed by `/report`.

## If reports get abused

Delete the webhook in Discord, make a new one and replace the secret. The apps keep working. To stop
everything for a while, remove the secret: the Worker then answers "Reporting isn't set up yet".

## Test locally

Put `DISCORD_WEBHOOK=<a test webhook or a local catcher>` in `.dev.vars` (not committed), then
`npx wrangler dev`, and POST a report to `http://127.0.0.1:8787/report`.
