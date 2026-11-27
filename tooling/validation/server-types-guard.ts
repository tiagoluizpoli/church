import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ts from 'typescript';
import { readApplicationSourceFiles, type SourceFile } from './source-files';

const FAIL_FLAG = '--fail';

// Server implementation folders (#1179). Domain contracts, entities, errors
// and the rest of domain/ stay outside, so they are never checked.
const CHECKED_PATH_PATTERN =
  /^apps\/server\/src\/(?:application|infrastructure|api|domain\/services|main)\//;
const EXEMPT_PATH_PATTERN =
  /\.types\.ts$|\.d\.ts$|^apps\/server\/src\/api\/dtos\//;

const isChecked = ({ path }: SourceFile) =>
  CHECKED_PATH_PATTERN.test(path) && !EXEMPT_PATH_PATTERN.test(path);

function declarationsOf({ path, source }: SourceFile): string[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ESNext,
    true,
  );
  const declarations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const kind = ts.isInterfaceDeclaration(node) ? 'interface' : 'type';
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      declarations.push(`${path}:${line + 1}: ${kind} ${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
}

export function getServerTypeDeclarations({
  files,
}: {
  files: SourceFile[];
}): string[] {
  return files.filter(isChecked).flatMap(declarationsOf);
}

// Lines grouped by folder, so each migrate batch can read its remaining work.
function formatReport({ files }: { files: SourceFile[] }): string[] {
  const byFolder = new Map<string, string[]>();
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const declarations = getServerTypeDeclarations({ files: [file] });
    if (declarations.length === 0) continue;
    const folder = dirname(file.path);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), ...declarations]);
  }
  const lines = [...byFolder].flatMap(([folder, declarations]) => [
    `${folder}: ${declarations.length}`,
    ...declarations.map((declaration) => `  ${declaration}`),
  ]);
  const total = [...byFolder.values()].flat().length;
  return total === 0
    ? []
    : [
        ...lines,
        `${total} type declarations in server implementation files (#1179: move them to contracts)`,
      ];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const failing = args.includes(FAIL_FLAG);
  const paths = args.filter((arg) => arg !== FAIL_FLAG);
  const files =
    paths.length > 0
      ? paths.map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      : readApplicationSourceFiles();
  const report = formatReport({ files });
  if (report.length > 0 && failing) {
    console.error(report.join('\n'));
    process.exitCode = 1;
  } else if (report.length > 0) {
    console.log(report.join('\n'));
  }
}
