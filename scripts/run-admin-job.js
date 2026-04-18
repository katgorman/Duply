const DEFAULT_BASE_URL = 'https://duply-backend-835k.onrender.com';
const DEFAULT_JOB_ID = 'job-augment-us-retailers-ec863f56f8';
const DEFAULT_MAX_STEPS = 3;
const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 30;
const DEFAULT_MAX_BACKOFF_MS = 60000;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    const compactText = text.replace(/\s+/g, ' ').slice(0, 280);
    throw new Error(`Request failed ${response.status}: ${compactText}`);
  }

  return JSON.parse(text);
}

async function getJob(baseUrl, jobId) {
  return fetchJson(`${baseUrl}/admin/jobs/${encodeURIComponent(jobId)}`);
}

async function runJob(baseUrl, jobId, maxSteps) {
  return fetchJson(`${baseUrl}/admin/jobs/${encodeURIComponent(jobId)}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxSteps }),
  });
}

function logCheckpoint(prefix, state) {
  const cursor = state?.cursor?.startIndex ?? 'n/a';
  const written = state?.progress?.written ?? 0;
  const discovered = state?.progress?.retailerSummaries?.ulta?.urlsDiscovered ?? 'n/a';
  const updatedAt = state?.updatedAt ?? '';
  console.log(`${prefix} status=${state?.status} cursor=${cursor} written=${written} ultaUrls=${discovered} updatedAt=${updatedAt}`);
}

async function main() {
  const baseUrl = (process.env.DUPLY_ADMIN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const jobId = process.env.DUPLY_ADMIN_JOB_ID || process.argv[2] || DEFAULT_JOB_ID;
  const maxSteps = parseInteger(process.env.DUPLY_ADMIN_JOB_STEPS || process.argv[3], DEFAULT_MAX_STEPS);
  const intervalMs = parseInteger(process.env.DUPLY_ADMIN_JOB_INTERVAL_MS || process.argv[4], DEFAULT_INTERVAL_MS);
  const maxConsecutiveErrors = parseInteger(process.env.DUPLY_ADMIN_JOB_MAX_ERRORS, DEFAULT_MAX_CONSECUTIVE_ERRORS);
  const maxBackoffMs = parseInteger(process.env.DUPLY_ADMIN_JOB_MAX_BACKOFF_MS, DEFAULT_MAX_BACKOFF_MS);

  let consecutiveErrors = 0;
  console.log(`Starting admin job runner for ${jobId} at ${baseUrl} with maxSteps=${maxSteps} intervalMs=${intervalMs}`);

  while (true) {
    try {
      const current = await getJob(baseUrl, jobId);
      logCheckpoint('Current', current);

      if (current.status === 'completed') {
        console.log('Job already completed.');
        return;
      }

      if (current.status === 'failed') {
        throw new Error(current.error || 'Job is in failed state');
      }

      const updated = await runJob(baseUrl, jobId, maxSteps);
      consecutiveErrors = 0;
      logCheckpoint('Updated', updated);

      if (updated.status === 'completed') {
        console.log('Job completed.');
        return;
      }
    } catch (error) {
      consecutiveErrors += 1;
      console.error(`Runner error ${consecutiveErrors}/${maxConsecutiveErrors}:`, error instanceof Error ? error.message : error);
      if (consecutiveErrors >= maxConsecutiveErrors) {
        process.exitCode = 1;
        return;
      }
      const backoffMs = Math.min(intervalMs * 2 ** Math.max(0, consecutiveErrors - 1), maxBackoffMs);
      console.log(`Backing off for ${backoffMs}ms before retrying...`);
      await sleep(backoffMs);
      continue;
    }

    await sleep(intervalMs);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
