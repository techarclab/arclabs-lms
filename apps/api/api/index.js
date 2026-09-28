// Vercel Function entry: every request is rewritten here (see vercel.json) and handled by Nest.
// The build compiles src/ to dist/ and bundles dist/serverless.js into one CommonJS file
// (scripts/bundle-serverless.mjs), because Vercel's launcher can't require() ES-module packages.
module.exports = require('../dist/serverless.bundle.cjs').default;
