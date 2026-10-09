const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// modelo 3D do Shenlong (tools/dragon/build.mjs)
config.resolver.assetExts.push('glb');

// canvaskit-wasm (Skia on web) references node built-ins that don't exist in the browser.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'fs' || moduleName === 'path')) return { type: 'empty' };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
