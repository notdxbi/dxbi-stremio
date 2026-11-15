import { execFile } from "child_process";
import { app, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { IPC_CHANNELS } from "../constants";
import { getLogger } from "../utils/logger";

const logger = getLogger("DeviceClock");

// The clock the computer itself shows, as minutes ahead of UTC (BC's Pacific time = -420).
//
// Chromium works out local time from the time zone rules built into it, and those go out of date
// when a place changes its rules: British Columbia stopped turning its clocks back in November
// 2026, so Electron 41 still put Vancouver an hour behind the Mac's own clock. The operating
// system gets updated rules, so dx.bi asks it instead and the page shows times with that offset.
export default class DeviceClock {
    public static initIPC(): void {
        ipcMain.handle(IPC_CHANNELS.DEVICE_UTC_OFFSET, () => this.offset());
        ipcMain.handle(IPC_CHANNELS.MPV_LOG_TAIL, () => this.mpvLogTail());
    }

    // The end of mpv's log, for problem reports: why a stream "failed to load" is only written
    // there. Addresses keep only their host, and long hex runs (keys, tokens, hashes) are hidden.
    public static mpvLogTail(): string {
        try {
            const file = join(app.getPath("userData"), "mpv.log");
            if (!existsSync(file)) return "";
            const text = readFileSync(file, "utf8");
            const lines = text.split(/\r?\n/).filter((l) => /\b(error|fail|warn|cannot|could not|unable|denied|refused|timed out|end-file|http|tls|ssl)\b/i.test(l));
            return lines.slice(-25).map((l) => l
                .replace(/\b(https?|rtmp|rtsp|ftp):\/\/([^/\s'"]+)[^\s'"]*/gi, "$1://$2/…")
                .replace(/[0-9a-f]{32,}/gi, "[hex]")
                .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "C:\\Users\\[user]")
                .replace(/\/(home|Users)\/[^/\s]+/g, "/$1/[user]")
                .slice(0, 300)).join("\n");
        } catch (err) {
            logger.warn(`Couldn't read mpv.log: ${err}`);
            return "";
        }
    }

    public static async offset(): Promise<number | null> {
        try {
            const minutes = process.platform === "win32" ? this.windowsOffset() : await this.posixOffset();
            return minutes !== null && Number.isFinite(minutes) && Math.abs(minutes) <= 18 * 60 ? minutes : null;
        } catch (err) {
            logger.warn(`Couldn't read the device's time zone offset: ${err}`);
            return null;
        }
    }

    // `date +%z` prints the system's own offset, e.g. "-0700"
    private static posixOffset(): Promise<number | null> {
        return new Promise((resolve) => {
            execFile("date", ["+%z"], { timeout: 3000 }, (err, out) => {
                const m = /^([+-])(\d\d)(\d\d)/.exec(String(out || "").trim());
                if (err || !m) return resolve(null);
                resolve((m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])));
            });
        });
    }

    // Windows: the difference between the local and UTC clocks Windows keeps (SYSTEMTIME structs)
    private static windowsOffset(): number | null {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const koffi = require("koffi");
        const kernel = koffi.load("kernel32.dll");
        const getLocal = kernel.func("void __stdcall GetLocalTime(_Out_ void *time)");
        const getUtc = kernel.func("void __stdcall GetSystemTime(_Out_ void *time)");
        const local = Buffer.alloc(16), utc = Buffer.alloc(16);
        getUtc(utc);
        getLocal(local);
        const ms = (b: Buffer) => Date.UTC(b.readUInt16LE(0), b.readUInt16LE(2) - 1, b.readUInt16LE(6), b.readUInt16LE(8), b.readUInt16LE(10), b.readUInt16LE(12));
        // read a moment apart: round to the quarter hour every real offset is a multiple of
        return Math.round((ms(local) - ms(utc)) / 900000) * 15;
    }
}
