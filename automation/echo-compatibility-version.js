const { argv } = require('node:process');
const systemObj = require('../system.json');

const requestedVersionType = argv[2];
const validVersionTypes = ['minimum', 'verified', 'maximum']
if (!validVersionTypes.includes(requestedVersionType)) {
    throw new Error(`Invalid version type request: ${requestedVersionType}. Must be one of: ${validVersionTypes.join(', ')}`);
}
console.log(`${requestedVersionType}Version=${systemObj.compatibility[requestedVersionType]}`);
