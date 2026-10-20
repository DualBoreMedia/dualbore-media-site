// WorkOS cursors are opaque. Never infer completion from page size or silently
// treat a truncated directory as an absent session/membership.
export async function* workosPages(fetchPage) {
  let after;
  const seen = new Set();
  for (let page = 0; page < 1000; page++) {
    const result = await fetchPage({limit: 100, ...(after ? {after} : {})});
    if (!result || !Array.isArray(result.data)) throw new Error('Invalid WorkOS page.');
    yield result.data;
    const next = result.listMetadata?.after;
    if (next === undefined || next === null || next === '') return;
    if (typeof next !== 'string' || seen.has(next)) throw new Error('WorkOS pagination did not advance.');
    seen.add(next);
    after = next;
  }
  throw new Error('WorkOS pagination could not be completed safely.');
}

export async function allWorkosPages(fetchPage) {
  const rows = [];
  for await (const page of workosPages(fetchPage)) rows.push(...page);
  return rows;
}
