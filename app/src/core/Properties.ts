import { homedir } from "os";
import { join } from "path";

class Properties {
    public static themeLinkSelector: string = "head > link[rel=stylesheet]";

    private static baseDataPath: string = process.platform === "win32"
        ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
        : process.platform === "darwin"
            ? join(homedir(), "Library", "Application Support")
            : join(homedir(), ".config");

    // DXBI_DATA_DIR keeps a source build's plugins, themes and server apart from an installed dx.bi
    public static enhancedPath = process.env.DXBI_DATA_DIR || join(Properties.baseDataPath, "dxbi");

    public static themesPath = join(Properties.enhancedPath, "themes");
    public static pluginsPath = join(Properties.enhancedPath, "plugins");

    // Stremio Enhanced's folder: dx.bi offers to bring your sign-in and settings over from it once
    public static enhancedImportPath = join(Properties.baseDataPath, "stremio-enhanced");
}

export default Properties;