interface PluginOption {
    key: string;
    type: "input" | "toggle" | "select";
    label: string;
    description?: string;
    defaultValue?: any;
    options?: { label: string; value: any }[]; // For select type
    group?: string; // Section it's listed under (dx.bi's settings are grouped, with a search)
}

export default PluginOption;