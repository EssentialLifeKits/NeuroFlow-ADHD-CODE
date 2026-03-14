/**
 * patch-node24.js
 * ---------------
 * Node.js 24 enables TypeScript stripping by default but refuses to process
 * .ts files inside node_modules. Several Expo packages ship with "main"
 * pointing to TypeScript source (intended for Metro/Babel only), which crashes
 * the Expo CLI before Metro even starts.
 *
 * Strategy per package:
 *
 *  expo-modules-core — already ships a root index.js stub (returns null). We
 *    just redirect "main" there. Metro uses Babel and ignores this null stub.
 *
 *  expo — provides the URL polyfill that @expo/metro-runtime MUST load at
 *    runtime. We CANNOT null it out for Metro. Fix: change "main" to a stub
 *    (so Node.js CLI is happy) AND set "react-native" to the TypeScript source
 *    (so Metro uses the real package via the react-native resolver field, which
 *    Metro checks before "main").
 *
 *  expo-file-system — native module only; our app never imports it directly.
 *    Safe to null for both contexts.
 *
 * Run automatically via npm postinstall.
 */

const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');

/**
 * Patches a package to be Node.js 24-safe.
 *
 * @param packageName  npm package name
 * @param fromMain     original "main" value that signals an unpacked install
 * @param toMain       JS stub to redirect "main" to (created if missing)
 * @param keepForMetro if set, also writes a "react-native" field with this
 *                     value so Metro (which prefers "react-native" over "main")
 *                     still receives the real source. Leave undefined for
 *                     pure-native modules where null is fine for Metro too.
 */
function patchPackage(packageName, fromMain, toMain, keepForMetro) {
  const pkgPath = path.join(nodeModules, packageName, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.log(`patch-node24: ${packageName} not found, skipping.`);
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const alreadyMainPatched = pkg.main === toMain;
  const alreadyNativePatched = !keepForMetro || pkg['react-native'] === keepForMetro;

  if (alreadyMainPatched && alreadyNativePatched) {
    console.log(`patch-node24: ${packageName} already patched, skipping.`);
    return;
  }

  if (pkg.main !== fromMain && !alreadyMainPatched) {
    console.log(`patch-node24: ${packageName} unexpected main="${pkg.main}", skipping.`);
    return;
  }

  // Create the stub JS file if it doesn't exist yet
  const stubPath = path.join(nodeModules, packageName, toMain);
  if (!fs.existsSync(stubPath)) {
    fs.writeFileSync(
      stubPath,
      '// Node.js 24 stub — Metro uses the "react-native" field and never loads this.\nmodule.exports = null;\n',
    );
  }

  pkg.main = toMain;

  if (keepForMetro) {
    // Metro resolver checks "react-native" before "main", so setting this
    // ensures the real TypeScript source is bundled by Metro while Node.js CLI
    // uses the plain JS stub above.
    pkg['react-native'] = keepForMetro;
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const metroNote = keepForMetro ? ` (react-native → ${keepForMetro})` : '';
  console.log(`patch-node24: ✅ ${packageName} patched (main: ${fromMain} → ${toMain}${metroNote})`);
}

// expo-modules-core ships a root index.js stub — redirect main only
patchPackage('expo-modules-core', 'src/index.ts', 'index.js');

// expo provides the URL polyfill — null main for CLI, keep src for Metro
patchPackage('expo', 'src/Expo.ts', '_node24_stub.js', 'src/Expo.ts');

// expo-file-system — native-only, safe to null for both contexts
patchPackage('expo-file-system', 'src/index.ts', '_node24_stub.js');
