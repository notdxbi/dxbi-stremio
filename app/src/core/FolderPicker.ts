import { BrowserWindow, dialog, ipcMain } from "electron";
import { IPC_CHANNELS } from "../constants";

// A "choose a folder" dialog for the page (Settings → dx.bi → Streaming cache folder)
export default class FolderPicker {
    public static initIPC(): void {
        ipcMain.handle(IPC_CHANNELS.PICK_FOLDER, async (event, title: unknown, defaultPath: unknown) => {
            const options: Electron.OpenDialogOptions = {
                title: typeof title === "string" ? title : "Choose a folder",
                defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined,
                properties: ["openDirectory", "createDirectory"],
            };
            const win = BrowserWindow.fromWebContents(event.sender);
            const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
            return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
        });
    }
}
