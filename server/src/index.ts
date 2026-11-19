/**
 * Server entrypoint: readiness report, then Fastify on PORT/HOST.
 */
import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { formatHealthReport, runHealthChecks } from './setup/checks.js';

const config = getConfig();
const report = await runHealthChecks(config);
console.log(`\n${formatHealthReport(report)}\n`);

const app = await buildApp({ config, logger: true });

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received — shutting down.`);
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  const address = await app.listen({ port: config.port, host: config.host });
  console.log(`ShortForge API:  ${address}`);
  console.log(`Jobs folder:     ${config.jobsDir}`);
  console.log(`Mock mode:       ${config.mockMode ? 'on (canned DeepSeek responses)' : 'off'}`);
  if (!report.ok) {
    console.log('Required tools are missing — the GUI will show the setup checklist.');
  }
} catch (error) {
  console.error('Failed to start ShortForge:', error);
  process.exit(1);
}
