// Quick test to verify the templates are loaded correctly
const { taskTemplates, getTemplatesForDepartment } = require('./taskTemplates');

console.log('=== HARDWARE TEMPLATES ===');
const hardwareTemplates = getTemplatesForDepartment('HARDWARE');
console.log('Template names:', Object.keys(hardwareTemplates));
console.log('\nTemplate details:');
Object.keys(hardwareTemplates).forEach(name => {
    console.log(`  - ${name}: ${hardwareTemplates[name].length} tasks`);
});

console.log('\n=== SOFTWARE TEMPLATES ===');
const softwareTemplates = getTemplatesForDepartment('SOFTWARE');
console.log('Template names:', Object.keys(softwareTemplates));
console.log('\nTemplate details:');
Object.keys(softwareTemplates).forEach(name => {
    console.log(`  - ${name}: ${softwareTemplates[name].length} tasks`);
});
