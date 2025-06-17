import fetch from 'node-fetch';
import path from 'path';
import yaml from 'js-yaml';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const OVERWRITE_INTERNAL_PLUGINS = true;

async function main() {
  const [yamlPath, buildPath] = process.argv.slice(2);

  if (!yamlPath || !buildPath) {
    console.error("Usage: node script.js <path_to_plugins_yaml> <path_to_build_folder>");
    process.exit(1);
  }
  const pluginJsPath = path.join(buildPath, "public/js/plugins.js");
  const pluginsDistPath = path.join(buildPath, 'plugins/src');

  try {
    const internalPlugins = await parsePluginJs(pluginJsPath);
    const externalPlugins = parsePluginYaml(yamlPath);
    const installedPlugins = await installPlugins(internalPlugins, externalPlugins, pluginsDistPath);
    updatePluginsJs(installedPlugins, pluginJsPath);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

async function parsePluginJs(pluginJsPath) {
  if (!existsSync(pluginJsPath)) {
    throw new Error(`plugins.js not found at ../../${pluginJsPath}`);
  }
  try {
    const { officialPlugins } = await import(`../../${pluginJsPath}`);
    console.log({officialPlugins});
    if (!Array.isArray(officialPlugins)) {
      throw new Error('Exported officialPlugins is not an array.');
    }
    return officialPlugins;
  } catch (error) {
    throw new Error(`Failed to import ${pluginJsPath}: ${error.message}`);
  }
}

function parsePluginYaml(yamlPath) {
  if (!existsSync(yamlPath)) {
    throw new Error(`plugins.yaml not found at ${yamlPath}`);
  }
  const content = readFileSync(yamlPath, 'utf8');
  const parsed = yaml.load(content);
  const plugins = parsed?.plugins;
  if (!Array.isArray(plugins) || plugins.length === 0) {
    throw new Error("No plugins defined in plugins.yaml.");
  }
  return plugins;
}

async function installPlugins(internalPlugins, externalPlugins, pluginsDistPath) {
  const resultMap = new Map();

  for (const plugin of internalPlugins) {
    console.log(`installing Plugin "${plugin.name}" from "${plugin.src}`);
    resultMap.set(plugin.name, plugin);
  }

  const installPromises = externalPlugins.map(async (plugin) => {
    if (OVERWRITE_INTERNAL_PLUGINS || !resultMap.has(plugin.name)) {
      const logEntry = `${!resultMap.has(plugin.name) ? "installing" : "overwriting"} Plugin "${plugin.name}" from "${plugin.url}`;
      try {
        return await loadPluginSources(plugin, pluginsDistPath, logEntry)
      } catch (error) {
        console.warn(`✗ ${logEntry}:`, error);
      }
    }
  });

  const installedPlugins = await Promise.all(installPromises);
  await installedPlugins
    .filter(Boolean) // remove nulls
    .forEach(plugin => resultMap.set(plugin.name, plugin));

  return Array.from(resultMap.values());
}

async function loadPluginSources(plugin, pluginsDistPath, logEntry) {
  const { name, folderName, kind, version, sha256, url, additionalResources } = plugin;

  if (!name || !folderName || !kind || !version || !url) {
    throw new Error(`missing fields: ${JSON.stringify(plugin, null, 2)}`);
  }

  const pluginDir = path.join(pluginsDistPath, toPlural(kind), folderName, version);
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true });
  }

  // Download additional resources
  if (Array.isArray(additionalResources)) {
    for (const resourceUrl of additionalResources) {
      const fileName = path.basename(resourceUrl);
      const resourcePath = path.join(pluginDir, fileName);
      try {
        await downloadFile(resourceUrl, resourcePath);
      } catch (err) {
        console.warn(`✗ ${logEntry}: Downloading resource ${fileName}`, err.message);
      }
    }
  }

  // Download main plugin
  const pluginPath = path.join(pluginDir, "index.js");
  try {
    await downloadFile(url, pluginPath);
    console.log(`✓ ${logEntry}`);
  } catch (err) {
    console.error(`✗ Failed to download plugin ${name}: ${err.message}`);
  }

  return mapExternalPlugin(plugin, `/plugins/src/${toPlural(kind)}/${folderName}/${version}/index.js`);
}

function toPlural(word) {
  if (word.endsWith('y')) {
    return word.slice(0, -1) + 'ies';
  } else if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es';
  } else {
    return word + 's';
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

  return new Promise((resolve, reject) => {
    const stream = createWriteStream(destination);
    response.body.pipe(stream);
    response.body.on('error', reject);
    stream.on('finish', resolve);
  });
}

function mapExternalPlugin(plugin, pluginPath) {
  return {
    name: plugin.name,
    src: pluginPath,
    icon: plugin.icon,
    activeByDefault: plugin.activeByDefault || false,
    requireDoc: plugin.requireDoc ?? false,
    kind: plugin.kind,
    ...(plugin.position ? { position: plugin.position } : {})
  };
}

function updatePluginsJs(installedPlugins, pluginJsPath) {
  try {
    writeFileSync(pluginJsPath, `export const officialPlugins = \n${JSON.stringify(installedPlugins, null, 2)}\n;\n`, 'utf8');
    console.log("✓ plugins.js updated.");
  } catch (error) {
    console.error("✗ failed to update plugins.js:", error);
  }
}
main();
