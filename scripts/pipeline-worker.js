'use strict';
require('dotenv').config();
const { setupDatabase } = require('../src/db/setup');
setupDatabase();
const { createQueue } = require('../src/pipeline/queue');
const { db } = require('../src/db');
const { execute } = require('../src/pipeline/tasks');
const { transientError } = require('../src/pipeline/policy');
const job = createQueue(db).get(Number(process.argv[2]));
async function main() {
  if (!job || job.status !== 'running') {
    throw new Error('Job nao esta em execucao');
  }
  const progress = require('../src/pipeline/progress').createProgress(db, job.identity);
  const result = await execute(job, { progress });
  progress.clear();
  if (process.send) {
    await new Promise(resolve => process.send({ pipelineResult: { result } }, resolve));
  }
}
main()
  .then(() => process.exit(0))
  .catch(async error => {
    if (process.send) {
      await new Promise(resolve =>
        process.send(
          {
            pipelineResult:
              error.code === 'PIPELINE_YIELD'
                ? { deferred: true }
                : { error: error.message, transient: transientError(error.message) },
          },
          resolve
        )
      );
    }
    process.exit(1);
  });
