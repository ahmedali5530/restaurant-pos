'use strict';

// Module registry — the extensibility point of this service.
//
// To add a new backend service, create a folder under `src/modules/<name>/`
// exposing an Express router, then add one entry to the array below:
//
//   { name: 'reports', basePath: '/reports', router: require('./reports/reports.routes') }
//
// `server.js` mounts each router at its `basePath`. Nothing else needs to change.

const modules = [
  {
    name: 'ai',
    basePath: '/ai',
    router: require('./ai/ai.routes'),
  },
  {
    name: 'fiscal',
    basePath: '/fiscal',
    router: require('./fiscal/fiscal.routes'),
  },
];

module.exports = { modules };
