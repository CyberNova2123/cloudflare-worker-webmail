// Optional production bundle for the web/ frontend.
//
// The prototype ships in-browser Babel + individual .jsx scripts (great for
// hacking, heavier at runtime). This script bundles+minifies everything into
// web/dist/app.js and writes a Babel-free web/dist/index.html that loads React
// from a CDN. To serve the bundle, point wrangler's assets.directory at
// ./web/dist (see docs/frontend.md). Output is gitignored.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const dist = join(web, "dist");
mkdirSync(dist, { recursive: true });

// Load order matters: config -> api set up window globals the components read.
const ORDER = ["config.jsx", "api.jsx", "ui.jsx", "auth.jsx", "mail.jsx", "compose.jsx", "settings.jsx", "app.jsx"];
const entry = ORDER.map((f) => `import "../${f}";`).join("\n");

await build({
  stdin: { contents: entry, resolveDir: dist, loader: "js" },
  bundle: true,
  format: "iife",
  target: "es2020",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  loader: { ".jsx": "jsx" },
  outfile: join(dist, "app.js"),
  minify: true,
  legalComments: "none",
});

for (const css of ["styles.css", "app.css"]) copyFileSync(join(web, css), join(dist, css));

// Production index.html: keep the original <head>, swap the script block for
// React (prod CDN) + the bundle. The Worker still injects __WEBMAIL_LIVE__, but
// we set it here too so the bundle is "live" even if served as a plain asset.
const src = readFileSync(join(web, "index.html"), "utf8");
const head = src.split('<div id="root"></div>')[0];
const tail = `<div id="root"></div>

  <script>window.__WEBMAIL_LIVE__ = true;</script>
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
  <script src="app.js"></script>
</body>
</html>
`;
writeFileSync(join(dist, "index.html"), head + tail);

console.log("Built web/dist/ (app.js + index.html + css).");
