import { readdirSync } from 'fs';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';

const commands = {
  extract: 'extract',
  compile: 'compile',
};

const command = process.argv[2];

if (!command) {
  throw new Error('No command provided');
}

if (!Object.values(commands).includes(command)) {
  throw new Error(`Invalid command provided: expected ${Object.values(commands).join(' or ')}`);
}

const packsSrcPath = 'packs/src';
const packsPath = 'packs';

if (command === commands.extract) {
  const packsContents = readdirSync(packsPath);
  const packs = packsContents.filter(pack => pack !== 'src' && pack !== '.gitignore');
  console.log(`Extracting ${packs.length} packs...`);
  for (const pack of packs) {
    console.log(`Extracting ${pack}`);
    await extractPack(`${packsPath}/${pack}`, `${packsSrcPath}/${pack}`, {yaml: true});
  }
}
