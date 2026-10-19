import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const sourceExtensions = new Set(['.js', '.mjs', '.jsx']);

function slash(value) {
  return value.split(path.sep).join('/');
}

function sourcePath(root, value, label) {
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} source path escapes the repository: ${value}`);
  }
  return {absolute, relative: slash(relative)};
}

function validatePoint(point, sourceLineCount, label) {
  if (!point || !Number.isInteger(point.line) || point.line < 1 || point.line > sourceLineCount) {
    throw new Error(`${label} has a source-map line outside its source file.`);
  }
  if (point.column !== null && point.column !== undefined && !Number.isInteger(point.column)) {
    throw new Error(`${label} has an invalid source-map column.`);
  }
}

function validateLocation(location, sourceLineCount, label, allowUnmapped = false) {
  if (!location || (!location.start?.line && !location.end?.line)) {
    if (allowUnmapped) return false;
    throw new Error(`${label} is missing a source-map location.`);
  }
  if (location.start) validatePoint(location.start, sourceLineCount, label);
  if (location.end) validatePoint(location.end, sourceLineCount, label);
  if (location.start && location.end && location.end.line < location.start.line) {
    throw new Error(`${label} has a reversed source-map location.`);
  }
  return true;
}

function validateSourceMap(data, relative, root, runner) {
  if (!data || typeof data !== 'object' || typeof data.path !== 'string') {
    throw new Error(`${runner} coverage entry for ${relative} has no source path.`);
  }
  const mapped = sourcePath(root, data.path, `${runner} mapped`);
  if (mapped.relative !== relative) {
    throw new Error(`${runner} mapped ${relative} to a different source: ${mapped.relative}`);
  }
  if (!existsSync(mapped.absolute)) throw new Error(`${runner} mapped source is missing: ${relative}`);

  const lineCount = readFileSync(mapped.absolute, 'utf8').split(/\r?\n/).length;
  let negativeColumns = 0;
  let unmappedBranchLocations = 0;
  const validate = (loc, label) => {
    validateLocation(loc, lineCount, label);
    for (const point of [loc.start, loc.end]) if (point?.column < 0) negativeColumns++;
  };
  for (const [kind, entries] of Object.entries({statementMap: data.statementMap, branchMap: data.branchMap, fnMap: data.fnMap})) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error(`${runner} coverage for ${relative} has an invalid ${kind}.`);
    }
    for (const [index, entry] of Object.entries(entries)) {
      if (kind === 'branchMap') {
        validate(entry.loc, `${runner} ${relative} branch ${index}`);
        if (!Array.isArray(entry.locations)) throw new Error(`${runner} ${relative} branch ${index} has no locations.`);
        entry.locations.forEach((loc, part) => {
          if (!validateLocation(loc, lineCount, `${runner} ${relative} branch ${index}.${part}`, true)) unmappedBranchLocations++;
          else for (const point of [loc.start, loc.end]) if (point?.column < 0) negativeColumns++;
        });
      } else if (kind === 'fnMap') {
        validate(entry.loc, `${runner} ${relative} function ${index}`);
        validate(entry.decl, `${runner} ${relative} function declaration ${index}`);
      } else {
        validate(entry, `${runner} ${relative} ${kind} ${index}`);
      }
    }
  }

  for (const [mapName, counters, branch] of [['statementMap', data.s, false], ['fnMap', data.f, false], ['branchMap', data.b, true]]) {
    const map = data[mapName];
    if (!counters || typeof counters !== 'object' || Array.isArray(counters)) {
      throw new Error(`${runner} coverage for ${relative} has invalid ${mapName} counters.`);
    }
    const mapKeys = Object.keys(map).sort();
    const counterKeys = Object.keys(counters).sort();
    if (JSON.stringify(mapKeys) !== JSON.stringify(counterKeys)) {
      throw new Error(`${runner} coverage for ${relative} has unmapped ${mapName} counters.`);
    }
    for (const [index, count] of Object.entries(counters)) {
      const values = branch ? count : [count];
      if (!Array.isArray(values) || values.some(value => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`${runner} coverage for ${relative} has invalid ${mapName} counts.`);
      }
      if (branch && values.length !== map[index].locations.length) {
        throw new Error(`${runner} coverage for ${relative} branch ${index} has unmatched counters.`);
      }
    }
  }
  return {negativeColumns, unmappedBranchLocations};
}

function canonicalEntries(data, root, runner) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${runner} coverage report is not a map.`);
  const entries = new Map();
  const negativeColumns = new Map();
  for (const [key, value] of Object.entries(data)) {
    const canonical = sourcePath(root, key, `${runner} report`).relative;
    if (entries.has(canonical)) throw new Error(`${runner} report contains duplicate canonical source paths: ${canonical}`);
    negativeColumns.set(canonical, validateSourceMap(value, canonical, root, runner));
    entries.set(canonical, value);
  }
  return {entries, negativeColumns};
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mapsMatch(left, right) {
  return ['statementMap', 'branchMap', 'fnMap'].every(key => stable(left[key]) === stable(right[key]));
}

function mergeCounters(left, right) {
  const merged = structuredClone(left);
  for (const key of Object.keys(merged.s)) merged.s[key] += right.s[key];
  for (const key of Object.keys(merged.f)) merged.f[key] += right.f[key];
  for (const key of Object.keys(merged.b)) merged.b[key] = merged.b[key].map((count, index) => count + right.b[key][index]);
  return merged;
}

function walkSources(root, folder) {
  const absolute = path.join(root, folder);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) return walkSources(root, path.relative(root, full));
    if (entry.isSymbolicLink()) throw new Error(`Coverage source inventory does not follow symlinks: ${slash(path.relative(root, full))}`);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [slash(path.relative(root, full))] : [];
  });
}

export function expectedCoverageSources(root, excluded = []) {
  const files = [
    ...walkSources(root, 'netlify'),
    ...walkSources(root, 'src'),
    ...walkSources(root, 'worker'),
    ...readdirSync(path.join(root, 'scripts'), {withFileTypes: true})
      .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
      .map(entry => `scripts/${entry.name}`),
  ];
  const omit = new Set(excluded);
  return [...new Set(files)].filter(file => !omit.has(file)).sort();
}

function assertInventory(actual, expected, label) {
  const missing = expected.filter(file => !actual.has(file));
  const unexpected = [...actual.keys()].filter(file => !expected.includes(file));
  if (missing.length || unexpected.length) {
    const reasons = [];
    if (missing.length) reasons.push(`missing: ${missing.join(', ')}`);
    if (unexpected.length) reasons.push(`unexpected: ${unexpected.join(', ')}`);
    throw new Error(`${label} source inventory mismatch (${reasons.join('; ')}).`);
  }
}

export function combineCoverageReports({nodeData, browserData, root, expectedNodeFiles, expectedBrowserFiles}) {
  const repository = path.resolve(root);
  const nodeReport = canonicalEntries(nodeData, repository, 'Node');
  const browserReport = canonicalEntries(browserData, repository, 'Chromium');
  const {entries: node, negativeColumns: nodeNegativeColumns} = nodeReport;
  const {entries: browser, negativeColumns: browserNegativeColumns} = browserReport;
  assertInventory(node, expectedNodeFiles, 'Node');
  assertInventory(browser, expectedBrowserFiles, 'Chromium');

  const combined = {};
  const manifest = [];
  for (const file of expectedNodeFiles) {
    const nodeCoverage = node.get(file);
    const browserCoverage = browser.get(file);
    if (file.startsWith('src/') && !browserCoverage) {
      throw new Error(`Chromium coverage is missing frontend source: ${file}`);
    }
    if (browserCoverage && !nodeCoverage) throw new Error(`Chromium measured an unaccounted source: ${file}`);

    if (browserCoverage && mapsMatch(nodeCoverage, browserCoverage)) {
      combined[nodeCoverage.path] = mergeCounters(nodeCoverage, browserCoverage);
      manifest.push({
        file,
        authority: 'Node + Chromium counters',
        maps: 'identical',
        browserExecuted: Object.values(browserCoverage.s).some(count => count > 0),
        nodeNegativeColumns: nodeNegativeColumns.get(file)?.negativeColumns ?? 0,
        browserNegativeColumns: browserNegativeColumns.get(file)?.negativeColumns ?? 0,
        nodeUnmappedBranchLocations: nodeNegativeColumns.get(file)?.unmappedBranchLocations ?? 0,
        browserUnmappedBranchLocations: browserNegativeColumns.get(file)?.unmappedBranchLocations ?? 0,
      });
      continue;
    }

    const useBrowser = file.endsWith('.jsx');
    const selected = useBrowser ? browserCoverage : nodeCoverage;
    combined[selected.path] = selected;
    manifest.push({
      file,
      authority: useBrowser ? 'Chromium' : 'Node',
      maps: browserCoverage ? 'incompatible; counters not combined' : 'single runner',
      browserExecuted: browserCoverage ? Object.values(browserCoverage.s).some(count => count > 0) : false,
      nodeExecuted: Object.values(nodeCoverage.s).some(count => count > 0),
      nodeNegativeColumns: nodeNegativeColumns.get(file)?.negativeColumns ?? 0,
      browserNegativeColumns: browserNegativeColumns.get(file)?.negativeColumns ?? 0,
      nodeUnmappedBranchLocations: nodeNegativeColumns.get(file)?.unmappedBranchLocations ?? 0,
      browserUnmappedBranchLocations: browserNegativeColumns.get(file)?.unmappedBranchLocations ?? 0,
    });
  }
  return {combined, manifest};
}
