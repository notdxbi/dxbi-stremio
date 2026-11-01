// Nathflix — Copyright (C) 2026 lavagnou. Based on dx.bi, Copyright (C) 2026 dx.bi. GNU General Public License, version 3 or later (see LICENSE).
//
// For tests only: the part of Cloudflare D1's API the Worker uses (prepare → bind → all / run, batch),
// on Node's own SQLite (Node 22+). Lets the real worker.js run without Cloudflare.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function d1(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { db.prepare(sql).run(...args); return { success: true }; },
    _run() { db.prepare(sql).run(...args); },
  });
  return {
    prepare: (sql) => statement(sql),
    async batch(list) {
      db.exec("BEGIN");
      try {
        for (const s of list) s._run();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return list.map(() => ({ success: true }));
    },
    // what's stored, for checks
    dump: () => db.prepare("SELECT * FROM entries").all(),
  };
}
