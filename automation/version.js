const {writeFileSync, readFileSync} = require('fs');
const {exec} = require('child_process');
const {env} = require('node:process');

const versionArg = env.npm_package_version;

const systemFilePath = './system.json';
const systemFileEncoding = 'utf-8';
const packageVersion = `v${versionArg}`;

console.log(`Updating system.json with version '${packageVersion}'`);
const systemJson = readFileSync(systemFilePath, systemFileEncoding);
const systemObj = JSON.parse(systemJson);

const manifestUrl = `https://raw.githubusercontent.com/jamesjtb/uesrpg-3ev4/refs/tags/${packageVersion}/system.json`;

const downloadPath = `https://github.com/jamesjtb/uesrpg-3ev4/releases/download/${packageVersion}/uesrpg-bundle_${packageVersion}.zip`;


systemObj.version = packageVersion;
systemObj.manifest = manifestUrl;
systemObj.download = downloadPath;

writeFileSync(systemFilePath, JSON.stringify(systemObj, null, 2), systemFileEncoding);

exec(`git add system.json`, (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
})
