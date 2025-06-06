import { PluginConfig } from './plugin.js';

export function generatePluginPath(plugin: string): string {
  return location.origin+location.pathname+plugin;
}

export const officialPlugins: PluginConfig[] = [
];
