import fs from 'node:fs';

const getDirectories = (source) => {
  if (!fs.existsSync(source)) return [];
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
};

const apps = getDirectories('./apps');
const packages = getDirectories('./packages').map((pkg) => `pkg-${pkg}`);

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'bump',
      ],
    ],
    'scope-enum': [2, 'always', ['root', 'multiple', ...apps, ...packages]],
  },
};
