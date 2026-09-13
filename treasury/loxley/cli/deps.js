'use strict';
/* deps: the one import of viem. the bundle in vendor/viem.js is built from vendor/entry.js by `npm run vendor`
   and committed, so a clone runs with no npm install and no registry in reach. */
module.exports = require('../vendor/viem.js');
