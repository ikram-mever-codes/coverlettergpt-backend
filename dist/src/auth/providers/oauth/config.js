export function mergeDefaultAndUserConfig(defaultConfig, userConfigFn) {
    if (!userConfigFn) {
        return defaultConfig;
    }
    return {
        ...defaultConfig,
        ...userConfigFn(),
    };
}
//# sourceMappingURL=config.js.map