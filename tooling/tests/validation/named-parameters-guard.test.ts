import { describe, expect, it, setDefaultTimeout } from 'bun:test';
import { getNamedParameterFailures } from '../../validation/named-parameters-guard';

// Each case builds a type-checked program (about 2s), over the 5s default
// when the validation lanes run concurrently.
setDefaultTimeout(30_000);

const PATH = 'apps/server/src/example.ts';

const failuresFor = (source: string, path = PATH) =>
  getNamedParameterFailures({ files: [{ path, source }] });

const parameterFailure = (line: number, kind: string, count: number) =>
  `${PATH}:${line}: ${kind} takes ${count} parameters: take one object parameter with a named type`;

describe('named parameters guard', () => {
  it('accepts zero- and one-parameter functions, methods and constructors', () => {
    expect(
      failuresFor(`
        interface Input { id: string }
        export function none() {}
        export function one(input: Input) { return input; }
        export const arrow = (input: Input) => input;
        export const expression = function (input: Input) { return input; };
        export class Example {
          constructor(input: Input) { void input; }
          method(input: Input) { return input; }
        }
        export interface Port { find(input: Input): void; }
        export type Find = (input: Input) => void;
      `),
    ).toEqual([]);
  });

  it('rejects two or more parameters on each declaration kind', () => {
    expect(
      failuresFor(`interface Input { id: string }
export function declaration(a: Input, b: Input) { return [a, b]; }
export const expression = function (a: Input, b: Input) { return [a, b]; };
export const arrow = (a: Input, b: Input, c: Input) => [a, b, c];
export class Example {
  constructor(a: Input, b: Input) { void [a, b]; }
  method(a: Input, b: Input) { return [a, b]; }
}
export interface Port { find(a: Input, b: Input): void; }
export type Find = (a: Input, b: Input) => void;
`),
    ).toEqual([
      parameterFailure(2, 'function', 2),
      parameterFailure(3, 'function expression', 2),
      parameterFailure(4, 'arrow function', 3),
      parameterFailure(6, 'constructor', 2),
      parameterFailure(7, 'method', 2),
      parameterFailure(9, 'method signature', 2),
      parameterFailure(10, 'function type', 2),
    ]);
  });

  it('counts tx like any parameter and ignores a this parameter', () => {
    expect(
      failuresFor(`interface Input { id: string }
interface Transaction { commit(): void }
export function save(input: Input, tx: Transaction) { return [input, tx]; }
export function bound(this: Input, input: Input) { return [this, input]; }
`),
    ).toEqual([parameterFailure(3, 'function', 2)]);
  });

  it('rejects inline object types in parameter, variable, return and as positions', () => {
    const inlineFailure = (line: number, position: string) =>
      `${PATH}:${line}: inline object type in a ${position}: declare it as a named interface or type`;
    expect(
      failuresFor(`export type Named = { id: string; nested: { id: string } };
export function parameter(input: { id: string }) { return input; }
export const variable: Array<{ id: string }> = [];
export function returned(): Promise<{ id: string }> { return Promise.resolve({ id: '' }); }
export const cast = JSON.parse('{}') as { id: string };
`),
    ).toEqual([
      inlineFailure(2, 'parameter'),
      inlineFailure(3, 'variable'),
      inlineFailure(4, 'return type'),
      inlineFailure(5, '"as" cast'),
    ]);
  });

  it('exempts a callback passed to a dependency but checks one passed to our own helper', () => {
    const files = [
      {
        path: 'node_modules/fake-dependency/index.ts',
        source: `export function register(handler: (a: string, b: string) => void) { handler('a', 'b'); }
export function route(options: { handler: (a: string, b: string) => void }) { return options; }
`,
      },
      {
        path: 'apps/server/src/helpers.ts',
        source: `export type Handler = (a: string, b: string) => void;
`,
      },
      {
        path: PATH,
        source: `import { register, route } from 'fake-dependency';
import type { Handler } from './helpers';
register((a, b) => [a, b]);
route({ handler: (a, b) => [a, b] });
route({ handler(a, b) { return [a, b]; } });
[1, 2].map((value, index) => value + index);
const ownHelper = (handler: Handler) => handler;
ownHelper((a, b) => [a, b]);
`,
      },
    ];
    expect(getNamedParameterFailures({ files })).toEqual([
      'apps/server/src/helpers.ts:1: function type takes 2 parameters: take one object parameter with a named type',
      parameterFailure(8, 'arrow function', 2),
    ]);
  });

  it('rejects object-literal methods, call signatures and construct signatures', () => {
    expect(
      failuresFor(`interface Input { id: string }
export const literal = { method(a: Input, b: Input) { return [a, b]; } };
export interface Callable { (a: Input, b: Input): void }
export interface Constructable { new (a: Input, b: Input): Input }
`),
    ).toEqual([
      parameterFailure(2, 'method', 2),
      parameterFailure(3, 'call signature', 2),
      parameterFailure(4, 'construct signature', 2),
    ]);
  });

  it('checks a callback passed to our own helper imported from a workspace package', () => {
    const files = [
      {
        path: 'packages/core/src/each-pair.ts',
        source: `export function eachPair(handler: (...pair: string[]) => void) { handler('a', 'b'); }
`,
      },
      {
        path: PATH,
        source: `import { eachPair } from '@church/core/each-pair';
eachPair((a, b) => [a, b]);
`,
      },
    ];
    expect(getNamedParameterFailures({ files })).toEqual([
      parameterFailure(2, 'arrow function', 2),
    ]);
  });

  it('accepts a suppression with a reason and rejects one without', () => {
    expect(
      failuresFor(`interface Request { id: string }
interface Reply { send(): void }
// named-parameters-ignore: Fastify controls the handler signature
export async function handler(request: Request, reply: Reply) { return [request, reply]; }
export class Plugin {
  // named-parameters-ignore: Fastify controls the plugin signature
  register(request: Request, reply: Reply) { return [request, reply]; }
}
// named-parameters-ignore
export function unexplained(request: Request, reply: Reply) { return [request, reply]; }
// named-parameters-ignore:
export const blank = (request: Request, reply: Reply) => [request, reply];
`),
    ).toEqual([
      `${PATH}:9: named-parameters-ignore needs a reason: // named-parameters-ignore: <why the signature is not ours>`,
      `${PATH}:11: named-parameters-ignore needs a reason: // named-parameters-ignore: <why the signature is not ours>`,
    ]);
  });

  it('skips generated files and tests/ paths', () => {
    const source =
      'export function pair(a: string, b: string) { return [a, b]; }';
    const files = [
      'apps/web/src/routeTree.gen.ts',
      'packages/i18n/src/paraglide/messages.js',
      'apps/server/src/api/contracts/fastify-request.d.ts',
      'apps/server/tests/helpers/pair.ts',
      'apps/web/src/features/x/tests/pair.ts',
    ].map((path) => ({ path, source }));
    files.push({
      path: 'apps/web/src/infrastructure/api/pair.ts',
      source: `/**
 * Generated by orval v8.19.0
 * Do not edit manually.
 */
${source}`,
    });
    expect(getNamedParameterFailures({ files })).toEqual([]);
  });
});
