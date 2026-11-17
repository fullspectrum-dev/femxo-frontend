// Liveness for the container health check: no rendering, no API call.

export function GET() {
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
}
