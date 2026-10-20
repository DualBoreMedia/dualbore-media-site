import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse} from '@babel/parser';
import {mergeProcessCovs} from '@bcoe/v8-coverage';
import {convert} from 'ast-v8-to-istanbul';

function sourceAst(code) {
  return parse(code, {sourceType: 'module', plugins: ['estree', 'jsx']}).program;
}

// Istanbul represents the untaken, implicit else path with an empty location.
// Accept it only when the original source really has an if without an else.
export function implicitIfLocations(code) {
  const locations = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'IfStatement' && !node.alternate) {
      locations.add(`${node.loc.start.line}:${node.loc.start.column}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(sourceAst(code));
  return locations;
}

export async function convertNodeCoverage({root, files, processes}) {
  const expected = new Set(files.map(file => path.resolve(root, file)));
  const scripts = new Map();
  for (const script of mergeProcessCovs(processes).result) {
    if (!script.url.startsWith('file:')) continue;
    const absolute = path.resolve(fileURLToPath(script.url));
    if (!expected.has(absolute)) continue;
    if (scripts.has(absolute)) throw new Error(`Multiple V8 URLs resolve to the same source: ${path.relative(root, absolute)}`);
    scripts.set(absolute, script);
  }
  const report = {};
  for (const file of files) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error(`Coverage source escapes the repository: ${file}`);
    }
    const code = await readFile(absolute, 'utf8');
    const coverage = scripts.get(absolute) || {url: pathToFileURL(absolute).href, functions: []};
    // These are native ESM sources, not wrapped/transformed bundles. Refuse raw
    // ranges that cannot refer to this exact source instead of adjusting them.
    for (const fn of coverage.functions) for (const range of fn.ranges) {
      if (!Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset)
        || range.startOffset < 0 || range.endOffset > code.length || range.endOffset < range.startOffset) {
        throw new Error(`V8 coverage offsets do not match original source: ${file}`);
      }
    }
    if (coverage.functions.length && !coverage.functions.some(fn => fn.ranges.some(range => range.startOffset === 0 && range.endOffset === code.length))) {
      throw new Error(`V8 coverage does not contain the complete original ESM source: ${file}`);
    }
    const converted = await convert({code, ast: sourceAst(code), wrapperLength: 0, coverage});
    const entries = Object.entries(converted);
    if (entries.length !== 1 || path.resolve(entries[0][0]) !== absolute) {
      throw new Error(`V8 coverage did not resolve to its original source: ${file}`);
    }
    report[absolute] = entries[0][1];
  }
  return report;
}
