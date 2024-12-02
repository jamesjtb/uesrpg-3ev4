import { mkdirSync, readdirSync, rmSync } from 'fs';
import { compilePack, extractPack } from '@foundryvtt/foundryvtt-cli';

const commands = {
  extract: 'extract',
  compile: 'compile',
  clean: 'clean',
};

const command = process.argv[2];
const specifiedPack = process.argv[3].startsWith('--') ? null : process.argv[3];

const opts = process.argv.filter((arg) => arg.startsWith('--')).map(arg => arg.slice(2));

if (!command) {
  throw new Error('No command provided');
}

if (!Object.values(commands).includes(command)) {
  throw new Error(`Invalid command provided: expected ${Object.values(commands).join(' or ')}`);
}

const packsSrcPath = 'packs/src';
const packsPath = 'packs';

const findCompiledPacks = () => {
  const packsContents = readdirSync(packsPath);
  return packsContents.filter(pack => pack !== 'src');
};

if (command === commands.extract) {
  if (opts.includes('clean')) {
    rmSync(packsSrcPath, {recursive: true, force: true});
    mkdirSync(packsSrcPath);
  }
  const packs = findCompiledPacks();
  console.log(`Found ${packs.length} packs...`);
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

if (command === commands.clean) {
  const packs = findCompiledPacks();
  console.log(`Found ${packs.length} compiled packs...`);
  for (const pack of packs) {
    console.log(`Removing ${pack}`);
    rmSync(`${packsPath}/${pack}`, {recursive: true, force: true});
  }
}
