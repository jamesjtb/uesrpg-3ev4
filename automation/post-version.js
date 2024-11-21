const {writeFileSync, readFileSync} = require('fs');
const {exec} = require('child_process');
const packageObj = require('../package.json');

const systemFilePath = './system.json';
const systemFileEncoding = 'utf-8';
const packageVersion = packageObj.version;

console.log(`Updating system.json with version '${packageVersion}'`);
const systemJson = readFileSync(systemFilePath, systemFileEncoding);
const systemObj = JSON.parse(systemJson);

const splitDownloadPath = systemObj.download.split('/');
const lastElement = splitDownloadPath.length - 1;
splitDownloadPath[lastElement] = `v${packageVersion}.zip`;

systemObj.version = packageVersion;
systemObj.download = splitDownloadPath.join('/');

writeFileSync(systemFilePath, JSON.stringify(systemObj, null, 2), systemFileEncoding);

exec(`git add .; git commit -m "update system.json for ${packageVersion}; git push --tags"`, (error, stdout, stderr) => {
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
