/**
 * Disk cleanup used by the Settings page. Only ever deletes regenerable temp
 * folders inside job directories — never job JSON, audio masters, or renders
 * that a stage artifact points at.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const TEMP_DIRS = ['tmp', 'frames', 'render-tmp', 'chunks'];

export interface CleanupResult {
  freedBytes: number;
  removedFiles: number;
  scannedDirs: string[];
}

async function sizeOf(target: string): Promise<number> {
  let total = 0;
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += (await fs.stat(full)).size;
        } catch {
          /* file vanished */
        }
      }
    }
  }
  return total;
}

export async function cleanupJobTemps(jobsDir: string): Promise<CleanupResult> {
  const result: CleanupResult = { freedBytes: 0, removedFiles: 0, scannedDirs: [] };
  let jobEntries;
  try {
    jobEntries = await fs.readdir(jobsDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const jobEntry of jobEntries) {
    if (!jobEntry.isDirectory() || !/^[a-z0-9][a-z0-9-]{5,63}$/.test(jobEntry.name)) continue;
    for (const dirName of TEMP_DIRS) {
      const target = path.join(jobsDir, jobEntry.name, dirName);
      try {
        await fs.access(target);
      } catch {
        continue;
      }
      result.freedBytes += await sizeOf(target);
      result.scannedDirs.push(path.relative(jobsDir, target).split(path.sep).join('/'));
      try {
        const entries = await fs.readdir(target);
        result.removedFiles += entries.length;
      } catch {
        /* ignored */
      }
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(target, { recursive: true });
    }
  }

  return result;
}
