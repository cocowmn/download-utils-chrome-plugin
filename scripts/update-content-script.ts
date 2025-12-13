import { readFile, writeFile } from 'node:fs/promises';
import path from 'path';

export function updateContentScript(moduleNames: string[]) {
  return async function () {
    const contentScriptPath = path.join(process.cwd(), 'plugin/content.js');
    const contentScript = await readFile(contentScriptPath, 'utf8');

    const START_LIST_FLAG = '  // start script list';
    const END_LIST_FLAG = '  // end script list';

    const start = contentScript.indexOf(START_LIST_FLAG);
    const end = contentScript.indexOf(END_LIST_FLAG, start);

    if (start === -1 || end === -1) throw new Error('dependencies block not found');

    const updated =
      contentScript.slice(0, start) +
      `${START_LIST_FLAG}\n  ${moduleNames.map((d, index, array) => `'${d}'${index === array.length - 1 ? ',' : ''}`).join(',\n  ')}\n` +
      contentScript.slice(end);

    await writeFile(contentScriptPath, updated);
    console.log('Updated dependencies:', moduleNames);
  };
}
