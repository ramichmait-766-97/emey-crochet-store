import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Load real source for Node regression tests without generating build artifacts.
export function sourceLoader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    }).outputText;
    new Function('require', 'module', 'exports', compiled)(
      (name) => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('.')) return load(resolve(dirname(file), name + '.ts'));
        throw new Error(`Unexpected test dependency: ${name}`);
      },
      module,
      module.exports,
    );
    return module.exports;
  }
  return load;
}
