const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);


// canvaskit-wasm (Skia on web) references node built-ins that don't exist in the browser.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'fs' || moduleName === 'path')) return { type: 'empty' };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
