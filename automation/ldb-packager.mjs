import { readdirSync } from 'fs';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';

const commands = {
  extract: 'extract',
  compile: 'compile',
};

const command = process.argv[2];
const specifiedPack = process.argv[3];

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
  const packs = packsContents.filter(pack => pack !== 'src');
  console.log(`Found ${packs.filter.length} packs...`);
  for (const pack of packs) {
    if (specifiedPack && specifiedPack !== pack) continue;
    console.log(`Extracting ${pack}`);
    await extractPack(`${packsPath}/${pack}`, `${packsSrcPath}/${pack}`, {yaml: true});
  }
}

if (command === commands.compile) {
  const packsSrcContents = readdirSync(packsSrcPath);
  console.log(`Compiling ${packsSrcContents.length} packs...`);
  for (const pack of packsSrcContents) {
    console.log(`Compiling ${pack}`);
    await compilePack(`${packsSrcPath}/${pack}`, `${packsPath}/${pack}`, {yaml: true});
  }
}
