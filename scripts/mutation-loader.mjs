import {registerHooks} from 'node:module';
import {writeFileSync} from 'node:fs';

// Only installed explicitly by run-mutation-checks. Changes live solely in this
// test process's module loader; repository source and disk remain unchanged.
const mutation = JSON.parse(process.env.DBM_MUTATION_SPEC || 'null');
if (!mutation || !process.env.DBM_MUTATION_MARKER) throw Error('Mutation specification missing');
registerHooks({load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!decodeURIComponent(url).replaceAll('\\', '/').endsWith('/' + mutation.file)) return result;
  const source = String(result.source);
  if (source.split(mutation.from).length - 1 !== (mutation.occurrence === 'all' ? 2 : 1)) throw Error('Mutation target is absent or ambiguous');
  writeFileSync(process.env.DBM_MUTATION_MARKER, 'applied');
  return {...result, source: mutation.occurrence === 'all' ? source.replaceAll(mutation.from, mutation.to) : source.replace(mutation.from, mutation.to)};
}});
