import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { readApplicationSourceFiles, type SourceFile } from './source-files';

// The backend owns ordering (backend.md, "List queries"): every Drizzle read
// that returns several rows ends in a total ORDER BY.
const CHECKED_PATH_PATTERN = /^apps\/server\/src\/infrastructure\//;
const SELECT_METHODS = new Set([
  'select',
  'selectDistinct',
  'selectDistinctOn',
]);
const ORDER_FIX =
  'end it in a total ORDER BY, or add // list-order: <reason> above it';

const OPT_OUT_PATTERN = /^\s*\/\/\s*list-order\b:?(.*)$/;

const isChecked = ({ path }: SourceFile) => CHECKED_PATH_PATTERN.test(path);

// The outermost call of the method chain a `.select()` call starts.
function chainOf(selectCall: ts.CallExpression): ts.CallExpression {
  let chain = selectCall;
  while (
    ts.isPropertyAccessExpression(chain.parent) &&
    ts.isCallExpression(chain.parent.parent) &&
    chain.parent.parent.expression === chain.parent
  ) {
    chain = chain.parent.parent;
  }
  return chain;
}

interface ChainCall {
  method: string;
  call: ts.CallExpression;
}

function chainCalls(chain: ts.CallExpression): ChainCall[] {
  const calls: ChainCall[] = [];
  let node: ts.Expression = chain;
  while (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    calls.unshift({ method: node.expression.name.text, call: node });
    node = node.expression.expression;
  }
  return calls;
}

const isLimitOne = ({ method, call }: ChainCall) =>
  method === 'limit' && call.arguments[0]?.getText() === '1';

const AGGREGATE_FUNCTIONS = new Set([
  'avg',
  'avgDistinct',
  'count',
  'countDistinct',
  'max',
  'min',
  'sum',
  'sumDistinct',
]);
const SQL_AGGREGATE_PATTERN =
  /^`\s*(?:avg|bool_and|bool_or|count|max|min|sum)\s*\(/i;

// `count()`, `max(column)` or sql`count(…)`, optionally `.mapWith(…)`/`.as(…)`.
function isAggregate(expression: ts.Expression): boolean {
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression)
  ) {
    return isAggregate(expression.expression.expression);
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return AGGREGATE_FUNCTIONS.has(expression.expression.text);
  }
  return (
    ts.isTaggedTemplateExpression(expression) &&
    expression.tag.getText().startsWith('sql') &&
    SQL_AGGREGATE_PATTERN.test(expression.template.getText())
  );
}

// Every selected field is an aggregate: without GROUP BY that is one row.
function isAggregateOnly(calls: ChainCall[]): boolean {
  if (calls.some(({ method }) => method === 'groupBy')) return false;
  const fields = calls.find(({ method }) => SELECT_METHODS.has(method))?.call
    .arguments[0];
  return (
    fields !== undefined &&
    ts.isObjectLiteralExpression(fields) &&
    fields.properties.length > 0 &&
    fields.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) && isAggregate(property.initializer),
    )
  );
}

// A chain that ends in ORDER BY, or reads at most one row.
function isOrderedOrSingle(chain: ts.CallExpression): boolean {
  const calls = chainCalls(chain);
  return (
    calls.some(({ method }) => method === 'orderBy') ||
    calls.some(isLimitOne) ||
    isAggregateOnly(calls)
  );
}

const WRITE_METHODS = new Set(['insert', 'update', 'delete']);

const isCallArgument = (node: ts.Expression) =>
  (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) &&
  (node.parent.arguments?.includes(node) ?? false);

// The scope a builder variable is visible in: its function, or the file.
function scopeOf(node: ts.Node): ts.Node {
  let scope = node.parent;
  while (!ts.isSourceFile(scope) && !ts.isFunctionLike(scope)) {
    scope = scope.parent;
  }
  return scope;
}

function referencesOf(declaration: ts.VariableDeclaration): ts.Identifier[] {
  const { name } = declaration;
  if (!ts.isIdentifier(name)) return [];
  const references: ts.Identifier[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node !== name && node.text === name.text) {
      references.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(scopeOf(declaration));
  return references;
}

// A subquery: its rows reach SQL, never the caller, so order is moot. It is
// passed straight to a call (`exists`, `inArray`, a join), aliased with
// `.as()`, the source of an INSERT … SELECT, or a builder variable used only
// as call arguments.
function isSubquery(chain: ts.CallExpression): boolean {
  const methods = chainCalls(chain).map(({ method }) => method);
  if (methods.includes('as')) return true;
  if (methods.some((method) => WRITE_METHODS.has(method))) return true;
  if (isCallArgument(chain)) return true;
  const declaration = chain.parent;
  if (!ts.isVariableDeclaration(declaration)) return false;
  const references = referencesOf(declaration);
  return references.length > 0 && references.every(isCallArgument);
}

// The statement or class member a chain belongs to: what an opt-out comment
// sits directly above.
function statementOf(node: ts.Node): ts.Node {
  let statement = node;
  while (
    !ts.isSourceFile(statement.parent) &&
    !ts.isStatement(statement) &&
    !ts.isClassElement(statement)
  ) {
    statement = statement.parent;
  }
  return statement;
}

// `union(a, b)` and the other set operations read rows like a select.
const SET_OPERATIONS = new Set([
  'except',
  'exceptAll',
  'intersect',
  'intersectAll',
  'union',
  'unionAll',
]);

function isSelectCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return SET_OPERATIONS.has(callee.text);
  // A Drizzle select reads `.from()` a table; `Intl.PluralRules#select` does not.
  return (
    ts.isPropertyAccessExpression(callee) &&
    SELECT_METHODS.has(callee.name.text) &&
    chainCalls(chainOf(node)).some(({ method }) => method === 'from')
  );
}

export function getListOrderFailures({
  files,
}: {
  files: SourceFile[];
}): string[] {
  return files.filter(isChecked).flatMap(({ path, source }) => {
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.ESNext,
      true,
    );
    const lineOf = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const failures: string[] = [];
    // A one-line opt-out covers the line below it.
    const optedOutLines = new Set<number>();
    sourceFile.text.split('\n').forEach((text, index) => {
      const optOut = text.match(OPT_OUT_PATTERN);
      if (!optOut) return;
      optedOutLines.add(index + 2);
      if (!optOut[1]?.trim()) {
        failures.push(
          `${path}:${index + 1}: list-order opt-out needs a reason: // list-order: <why the order does not matter>`,
        );
      }
    });
    const isOptedOut = (chain: ts.CallExpression) =>
      optedOutLines.has(lineOf(chain)) ||
      optedOutLines.has(lineOf(statementOf(chain)));
    const visit = (node: ts.Node) => {
      if (isSelectCall(node)) {
        const chain = chainOf(node);
        if (
          !isOrderedOrSingle(chain) &&
          !isSubquery(chain) &&
          !isOptedOut(chain)
        ) {
          failures.push(
            `${path}:${lineOf(chain)}: list query has no .orderBy(): ${ORDER_FIX}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return failures;
  });
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  const files =
    paths.length > 0
      ? paths.map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      : readApplicationSourceFiles();
  const failures = getListOrderFailures({ files });
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
