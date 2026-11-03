// TZ=America/Vancouver node tools/device-clock-test.mjs: times follow the device's clock, not
// Chromium's built-in time zone rules (British Columbia kept UTC-7 from November 2026)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const start = source.indexOf("  const deviceClock = {");
const end = source.indexOf("  function countdownText(");
assert.ok(start > 0 && end > start, "deviceClock found");
const body = source.slice(start, end);

const make = (api) => vm.runInNewContext(`${body}; ({ deviceClock, whenText })`, {
  IN_APP: true, window: { StremioEnhancedAPI: api }, Date, Math, Number, document: { hidden: false, addEventListener() {} },
});
const at = Date.parse("2026-11-02T22:47:00Z");
const fmt = { hour: "numeric", minute: "2-digit" };

// The app says UTC-7 (the Mac's clock); the bundled rules may say UTC-8
{
  const { deviceClock } = make({ deviceUtcOffset: async () => -420 });
  await deviceClock.refresh();
  const t = deviceClock.time(new Date(at), fmt);
  assert.match(t, /^(3:47\s?PM|15:47)$/i, `device time, got ${t}`);
  assert.equal(deviceClock.wall(new Date(at)).h, 15);
  console.log(`PASS follows the device's offset (${t})`);
}

// Nothing from the app (Stremio Enhanced, older app): browser time, unchanged
{
  const { deviceClock } = make({});
  await deviceClock.refresh();
  const d = new Date(at);
  assert.equal(deviceClock.time(d, fmt), d.toLocaleTimeString(undefined, fmt));
  assert.equal(deviceClock.wall(d).h, d.getHours());
  console.log("PASS no device offset → browser time");
}

// Nonsense from the app is ignored
{
  const { deviceClock } = make({ deviceUtcOffset: async () => 99999 });
  await deviceClock.refresh();
  assert.equal(deviceClock.offset, null);
  console.log("PASS bad offsets ignored");
}

// Calendar days are the device's days: 23:30 local is still "Today" near midnight UTC
{
  const { deviceClock, whenText } = make({ deviceUtcOffset: async () => -420 });
  await deviceClock.refresh();
  const realNow = Date.now;
  Date.now = () => Date.parse("2026-11-03T06:00:00Z"); // 23:00 on the 2nd in UTC-7
  try {
    const later = new Date(Date.parse("2026-11-03T06:30:00Z"));
    const text = whenText(later.getTime());
    assert.match(text, /^Today (11:30\s?PM|23:30)$/i, `got ${text}`);
    console.log(`PASS calendar day and time on the device's clock (${text})`);
  } finally { Date.now = realNow; }
}
