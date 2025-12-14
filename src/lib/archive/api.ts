/* -------------------------------------------------------------------------- */
/* Public APIs                                                                */
/* -------------------------------------------------------------------------- */

import { ArchiveTool, type NodeTraversalFn } from './archive';

export function Archive(name?: string): ArchiveTool;
export function Archive(nodeOrQuerySelector: Node | string, callback: NodeTraversalFn): ArchiveTool;
export function Archive(
  name: string,
  nodeOrQuerySelector: Node | string,
  callback: NodeTraversalFn,
): ArchiveTool;
export function Archive(...args: any[]) {
  return new ArchiveTool(...args);
}

export async function downloadArchives(archives: ArchiveTool[], name = 'archives') {
  const root = new ArchiveTool(name);
  const entries = await Promise.all(
    archives.map(async (archive) => [`${archive.name}.zip`, await archive.toBlob()] as const),
  );
  entries.forEach(([path, blob]) => root.addFile(path, blob));
  await root.download();
}
