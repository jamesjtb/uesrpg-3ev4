const {writeFileSync, readFileSync} = require('fs');
const {exec} = require('child_process');
const {argv} = require('node:process');

const versionArg = argv[2];

const systemFilePath = './system.json';
const systemFileEncoding = 'utf-8';
const packageVersion = `v${versionArg}`;

console.log(`Updating system.json with version '${packageVersion}'`);
const systemJson = readFileSync(systemFilePath, systemFileEncoding);
const systemObj = JSON.parse(systemJson);

const manifestUrl = `https://raw.githubusercontent.com/jamesjtb/uesrpg-3ev4/refs/tags/${packageVersion}/system.json`

const splitDownloadPath = systemObj.download.split('/');
const lastElement = splitDownloadPath.length - 1;
splitDownloadPath[lastElement] = `${packageVersion}.zip`;

systemObj.version = packageVersion;
systemObj.manifest = manifestUrl;
systemObj.download = splitDownloadPath.join('/');

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
