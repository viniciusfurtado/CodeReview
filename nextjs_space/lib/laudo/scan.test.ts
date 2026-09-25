import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanRepository, groupIntoBatches, readBatchContents } from './scan';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'laudo-scan-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('scanRepository', () => {
  it('collects allowed source files and ignores node_modules/lockfiles/binary-like extensions', async () => {
    await mkdir(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'ignored');
    await writeFile(path.join(dir, 'package-lock.json'), '{}');
    await writeFile(path.join(dir, 'logo.png'), 'binary');
    await writeFile(path.join(dir, 'src.ts'), 'export const x = 1;');

    const result = await scanRepository(dir);

    expect(result.files.map((f) => f.relativePath)).toEqual(['src.ts']);
    expect(result.filesSkipped).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it('never follows a symbolic link that points outside the scanned directory', async () => {
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'laudo-scan-outside-'));
    const secretFile = path.join(outsideDir, 'secret.ts');
    await writeFile(secretFile, 'export const secret = "leak";');

    await symlink(secretFile, path.join(dir, 'linked.ts'));
    await writeFile(path.join(dir, 'real.ts'), 'export const real = 1;');

    const result = await scanRepository(dir);

    expect(result.files.map((f) => f.relativePath)).toEqual(['real.ts']);
    await rm(outsideDir, { recursive: true, force: true });
  });

  it('stops and marks truncated once the file-count cap is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(path.join(dir, `file${i}.ts`), `export const v${i} = ${i};`);
    }
    // Override the cap to 3 so the test doesn't need to create hundreds of
    // real files on disk to exercise the same truncation code path that the
    // real MAX_FILES_TOTAL constant guards in production.
    const result = await scanRepository(dir, { maxFiles: 3 });
    expect(result.files.length).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('stops and marks truncated once the total byte-size cap is exceeded', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'x'.repeat(100));
    await writeFile(path.join(dir, 'b.ts'), 'x'.repeat(100));
    await writeFile(path.join(dir, 'c.ts'), 'x'.repeat(100));
    const result = await scanRepository(dir, { maxTotalBytes: 150 });
    expect(result.files.length).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate when files stay under both caps', async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(path.join(dir, `file${i}.ts`), `export const v${i} = ${i};`);
    }
    const result = await scanRepository(dir);
    expect(result.files.length).toBe(5);
    expect(result.truncated).toBe(false);
  });
});

describe('groupIntoBatches', () => {
  it('chunks files into batches of the given size', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      relativePath: `f${i}.ts`,
      absolutePath: `/tmp/f${i}.ts`,
      sizeBytes: 10,
    }));
    const batches = groupIntoBatches(files, 4);
    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(4);
    expect(batches[2].length).toBe(2);
  });
});

describe('readBatchContents', () => {
  it('reads file contents as utf8', async () => {
    const filePath = path.join(dir, 'a.ts');
    await writeFile(filePath, 'export const a = 1;');
    const contents = await readBatchContents([
      { relativePath: 'a.ts', absolutePath: filePath, sizeBytes: 20 },
    ]);
    expect(contents).toEqual([{ relativePath: 'a.ts', content: 'export const a = 1;' }]);
  });
});
