import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { arch, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * `bun run typst:install`: puts the pinned Typst CLI (static musl build) at
 * `.tools/bin/typst`, where the server runs it. Dev machines, CI and the
 * server image all use this one command. Linux only; needs `tar` and `xz`.
 * Rerunnable: an installed binary of the pinned version is kept.
 */

const VERSION = '0.15.1';
// sha256 of each release asset, from `gh release view v0.15.1 -R typst/typst`.
const ASSETS: Record<string, { target: string; sha256: string }> = {
  x64: {
    target: 'x86_64-unknown-linux-musl',
    sha256: 'a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c',
  },
  arm64: {
    target: 'aarch64-unknown-linux-musl',
    sha256: '5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee',
  },
};

const BINARY = resolve(import.meta.dir, '../../.tools/bin/typst');

async function installedVersion(): Promise<string | null> {
  try {
    const process = Bun.spawn([BINARY, '--version'], { stdout: 'pipe' });
    const output = await new Response(process.stdout).text();
    return (await process.exited) === 0 ? output : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if ((await installedVersion())?.startsWith(`typst ${VERSION} `)) {
    console.log(`✓ typst ${VERSION} already at ${BINARY}`);
    return;
  }
  const asset = ASSETS[arch()];
  if (process.platform !== 'linux' || !asset) {
    throw new Error(
      `typst:install supports Linux x64/arm64 only, not ${process.platform}/${arch()}`,
    );
  }

  const url = `https://github.com/typst/typst/releases/download/v${VERSION}/typst-${asset.target}.tar.xz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(archive).digest('hex');
  if (digest !== asset.sha256) {
    throw new Error(`${url}: sha256 ${digest}, expected ${asset.sha256}`);
  }

  const work = await mkdtemp(join(tmpdir(), 'typst-install-'));
  try {
    const tarball = join(work, 'typst.tar.xz');
    await Bun.write(tarball, archive);
    const tar = Bun.spawn(['tar', '-xJf', tarball, '-C', work], {
      stderr: 'inherit',
    });
    if ((await tar.exited) !== 0) {
      throw new Error('tar -xJf failed (is xz installed?)');
    }
    await mkdir(resolve(BINARY, '..'), { recursive: true });
    const extracted = join(work, `typst-${asset.target}`, 'typst');
    await chmod(extracted, 0o755);
    await rename(extracted, BINARY).catch(async () => {
      // A different filesystem than the temp dir: copy instead.
      await Bun.write(BINARY, Bun.file(extracted));
      await chmod(BINARY, 0o755);
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(`✓ installed typst ${VERSION} at ${BINARY}`);
}

await main();
