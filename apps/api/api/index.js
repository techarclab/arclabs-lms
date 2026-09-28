// Vercel Function entry: every request is rewritten here (see vercel.json) and handled by Nest.
// The TypeScript app is compiled to dist/ by the build command first.
module.exports = require('../dist/serverless.js').default;
