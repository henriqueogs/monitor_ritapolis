'use strict';

const apiKey = String(process.env.RENDER_API_KEY || '').trim();
const serviceId = String(process.env.RENDER_SERVICE_ID || '').trim();

if (!apiKey || !/^srv-[a-z0-9]+$/.test(serviceId)) {
  process.stderr.write('Disjuntor requer RENDER_API_KEY e RENDER_SERVICE_ID validos\n');
  process.exitCode = 1;
} else {
  fetch(`https://api.render.com/v1/services/${serviceId}/suspend`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  })
    .then(async response => {
      if (!response.ok && response.status !== 409) {
        throw new Error(`Render recusou suspensao preventiva: HTTP ${response.status}`);
      }
      process.stdout.write(`API ${serviceId} suspensa preventivamente\n`);
    })
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
