import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function toPlural(word) {
  if (word.endsWith('y')) {
    return word.slice(0, -1) + 'ies';
  } else if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es';
  } else {
    return word + 's';
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node script.js <path_to_plugins_yaml> <path_to_build_folder>");
    process.exit(1);
  }

  const PLUGIN_YAML_PATH = args[0];
  const BUILD_PATH = args[1];
  const PLUGINS_ROOT = "plugins/src";
  const PLUGINS_JS_PATH = path.join(BUILD_PATH, "public/js/plugins.js");
  const PLUGINS_DIST_PATH = path.join(BUILD_PATH, PLUGINS_ROOT);

  if (!fs.existsSync(PLUGIN_YAML_PATH)) {
    console.error("plugins.yaml not found. Please create a plugins.yaml file with the plugins to install.");
    process.exit(1);
  }

  let plugins;
  try {
    const yamlContent = fs.readFileSync(PLUGIN_YAML_PATH, "utf8");
    const parsedYaml = yaml.load(yamlContent);
    plugins = parsedYaml.plugins || [];
  } catch (error) {
    console.error("Error parsing plugins.yaml:", error.message);
    process.exit(1);
  }

  if (!Array.isArray(plugins) || plugins.length === 0) {
    console.error("No plugins found in plugins.yaml. Please add plugins to install.");
    process.exit(1);
  }

  let newPluginsArray = '';

  for (const plugin of plugins) {
    const {name, displayName, type, requiredDoc, version, sha256, url, additionalResources, activeByDefault} = plugin;

    if (!name || !type || !version || !url || !displayName) {
      console.error("Invalid plugin configuration:", plugin);
      continue;
    }

    const pluralType = toPlural(type);
    const pluginDir = path.join(PLUGINS_DIST_PATH, pluralType, name, version);
    const pluginPath = path.join(pluginDir, `index.js`);

    console.log(`Plugin path: ${pluginPath}`);

    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, {recursive: true});
    }

    if(!additionalResources?.length) {
      console.log('No additional resources found');
    } else {
      for (const resource of additionalResources) {
        const resourceName = resource.substring(resource.lastIndexOf('/') + 1);
        const resourcePath = path.join(pluginDir, resourceName)
        try {
          console.log("Downloading resource from", resource);

          const response = await fetch(resource);
          if (!response.ok) throw new Error(`Failed to download resource: ${resourceName}`);

          const fileStream = fs.createWriteStream(resourcePath);
          await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on("error", reject);
            fileStream.on("finish", resolve);
          });

          console.log(`Successfully downloaded: ${resourceName}`);
        } catch (error) {
          console.error('Failed to download additional resources');
        }
      }
    }

    try {
      console.log(`Downloading plugin ${name} version ${version}...`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch plugin: ${response.statusText}`);

      const fileStream = fs.createWriteStream(pluginPath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
      });

      console.log(`Plugin ${name} version ${version} downloaded successfully and saved to ${pluginPath}.`);
    } catch (error) {
      console.error(`Failed to download plugin ${name}:`, error.message);
      continue;
    }

    const newPlugin = `
      {
        name: '${displayName}',
        src: '/${PLUGINS_ROOT}/${pluralType}/${name}/${version}/index.js',
        icon: 'plugin',
        activeByDefault: ${activeByDefault || false},
        requiredDoc: '${requiredDoc}',
        kind: '${type}'
      }`;

    if (!newPluginsArray.includes(`name: '${name}'`)) {
      newPluginsArray += `${newPlugin},`;
    }
  }

  const updatedPluginsJsContent =
`export const officialPlugins = [
  ${newPluginsArray}
];`;

  fs.writeFileSync(PLUGINS_JS_PATH, updatedPluginsJsContent, "utf8");
  console.log("Plugins successfully written to plugins.js.");
}

main().catch((error) => {
  console.error("An error occurred:", error.message);
  process.exit(1);
});
