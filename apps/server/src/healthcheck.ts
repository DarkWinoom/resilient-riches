const port = process.env.RR_PORT ?? '8080';
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    signal: AbortSignal.timeout(4000),
  });
  const body = (await response.json()) as { status?: string };
  if (!response.ok || body.status !== 'ok') process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
export {};
