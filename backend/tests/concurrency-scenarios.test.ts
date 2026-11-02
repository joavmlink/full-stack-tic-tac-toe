// The concurrency scenarios on PGlite: one session serializes the requests, so this proves their
// outcomes, not the locks, and keeps the suite working between runs of `npm run test:concurrency`.
import { startLocalPostgres } from '../src/db/local-postgres.js';
import { defineConcurrencyScenarios } from './concurrency/scenarios.js';

defineConcurrencyScenarios({
  instances: 1,
  poolSize: 1,
  realSessions: false,
  requireBothOrders: false,
  raceStepMs: 5,
  open: async () => {
    const local = await startLocalPostgres('memory://');
    return { connectionString: local.connectionString, close: () => local.stop() };
  },
});
