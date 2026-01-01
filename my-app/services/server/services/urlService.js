// Helper: normalize URL (prefer https). Returns {candidateUrls, input}
export function buildCandidateUrls(input) {
  const raw = (input || '').trim();
  if (!raw) return { input: raw, candidateUrls: [] };
  // If already has protocol, use as-is only
  if (/^https?:\/\//i.test(raw)) {
    return { input: raw, candidateUrls: [raw] };
  }
  // Strip leading protocol-like text if malformed
  const cleaned = raw.replace(/^\w+:\/\//, '');
  // Prefer https first, then http
  return {
    input: raw,
    candidateUrls: [
      `https://${cleaned}`,
      `http://${cleaned}`
    ]
  };
}

export async function tryFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Try HEAD first
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (!res.ok || res.status === 405) {
      // Some servers don't support HEAD well; try GET lightweight
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    const finalUrl = res.url || url;
    console.log(`🔍 Simple precheck: ${url} → ${finalUrl} (${res.status}) ✅`);
    return { ok: true, status: res.status, finalUrl, redirected: res.redirected };
  } catch (err) {
    console.log(`❌ Precheck failed: ${url} - ${err?.message}`);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}



