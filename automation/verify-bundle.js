const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { argv } = require('process');

const zipFile = argv[2];

if (!zipFile) {
  console.error('Error: No ZIP file specified');
  console.error('Usage: node verify-bundle.js <path-to-zip-file>');
  process.exit(1);
}

// Validate filename to prevent command injection
// Only allow alphanumeric, dash, underscore, dot, and forward slash for paths
if (!/^[\w\-./]+\.zip$/i.test(zipFile)) {
  console.error('Error: Invalid ZIP file path. Only alphanumeric, dash, underscore, dot, and forward slash are allowed.');
  process.exit(1);
}

if (!existsSync(zipFile)) {
  console.error(`Error: ZIP file not found: ${zipFile}`);
  process.exit(1);
}

console.log(`Verifying bundle: ${zipFile}`);

// List contents of the ZIP file
let zipContents;
try {
  zipContents = execSync(`unzip -l "${zipFile}"`, { encoding: 'utf-8' });
} catch (error) {
  console.error('Error: Failed to read ZIP file contents');
  console.error(error.message);
  process.exit(1);
}

// Required files for Foundry VTT system
const requiredFiles = [
  'system.json',
  'module/entrypoint.js',
  'styles/main.css',
  'LICENSE.txt'
];

// Required directories
const requiredDirs = [
  'packs/',
  'module/',
  'styles/',
  'templates/',
  'fonts/',
  'images/'
];

// Files that should NOT be in the bundle
const forbiddenPatterns = [
  '.git/',
  '.github/',
  'node_modules/',
  'packs/src/',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  'package.json',
  'package-lock.json',
  'automation/'
];

console.log('\n=== Checking Required Files ===');
let allRequiredFound = true;
for (const file of requiredFiles) {
  if (zipContents.includes(file)) {
    console.log(`✓ ${file}`);
  } else {
    console.error(`✗ MISSING: ${file}`);
    allRequiredFound = false;
  }
}

console.log('\n=== Checking Required Directories ===');
for (const dir of requiredDirs) {
  if (zipContents.includes(dir)) {
    console.log(`✓ ${dir}`);
  } else {
    console.error(`✗ MISSING: ${dir}`);
    allRequiredFound = false;
  }
}

console.log('\n=== Checking for Forbidden Files ===');
let noForbiddenFound = true;
for (const pattern of forbiddenPatterns) {
  if (zipContents.includes(pattern)) {
    console.error(`✗ FORBIDDEN FILE FOUND: ${pattern}`);
    noForbiddenFound = false;
  } else {
    console.log(`✓ ${pattern} not present`);
  }
}

// Verify system.json structure by extracting and parsing it
console.log('\n=== Verifying system.json ===');
let systemJsonValid = false;
try {
  const systemJsonContent = execSync(`unzip -p "${zipFile}" system.json`, { encoding: 'utf-8' });
  const systemObj = JSON.parse(systemJsonContent);
  
  // Check required fields
  const requiredSystemFields = ['title', 'version', 'esmodules', 'styles', 'packs', 'id'];
  let allFieldsPresent = true;
  for (const field of requiredSystemFields) {
    if (systemObj[field] !== undefined) {
      console.log(`✓ system.json has '${field}' field`);
    } else {
      console.error(`✗ system.json missing '${field}' field`);
      allFieldsPresent = false;
    }
  }
  
  systemJsonValid = allFieldsPresent;
} catch (error) {
  console.error('✗ Failed to parse system.json');
  console.error(error.message);
}

console.log('\n=== Verification Summary ===');
if (allRequiredFound && noForbiddenFound && systemJsonValid) {
  console.log('✓ Bundle verification PASSED');
  console.log('The ZIP file is properly structured for Foundry VTT');
  process.exit(0);
} else {
  console.error('✗ Bundle verification FAILED');
  if (!allRequiredFound) {
    console.error('  - Some required files or directories are missing');
  }
  if (!noForbiddenFound) {
    console.error('  - Some forbidden files are present in the bundle');
  }
  if (!systemJsonValid) {
    console.error('  - system.json is invalid or missing required fields');
  }
  process.exit(1);
}
