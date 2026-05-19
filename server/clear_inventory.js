const { clearInventoryDB, parseArgs } = require('./clear_inventory_db');

console.warn('[DEPRECATED] Use `node server/clear_inventory_db.js ...` instead of `node server/clear_inventory.js ...`.');

if (require.main === module) {
    clearInventoryDB(parseArgs(process.argv.slice(2)));
}
