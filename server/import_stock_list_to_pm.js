const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const connectDB = require('./db');
const { Classification, Vendor, Item, ItemVendorSku, StockLocation, StockBalance } = require('./models');

const FILE_PATH = process.argv[2] || 'C:/Users/Hameed/Downloads/Stock list.xlsx';
const SHEET_FILTER = (process.argv[3] || '').trim().toUpperCase();
const VENDOR_COLUMNS = ['EVELTA', 'KTRON', 'ROBU', 'SHARVI'];

const slug = (value) => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-./]/g, '');

const normName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normPackage = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

const toNumber = (value) => {
    if (value === '' || value == null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const classificationConfig = {
    RESISTOR: { name: 'RESISTOR', prefix: 'RES' },
    CAPACITOR: { name: 'CAPACITOR', prefix: 'CAP' },
    IC: { name: 'IC', prefix: 'IC' },
    OTHER_COMPONENT: { name: 'OTHER COMPONENT', prefix: 'OTH' }
};

async function ensureClassification(type) {
    const cfg = classificationConfig[type];
    let cls = await Classification.findOne({ name: cfg.name });
    if (!cls) {
        cls = await Classification.create({
            name: cfg.name,
            prefix: cfg.prefix,
            nextSequenceNumber: 1,
            isActive: true,
            department: 'HARDWARE'
        });
    }
    return cls;
}

async function ensureVendors() {
    const map = new Map();
    for (const name of VENDOR_COLUMNS) {
        const vendorCode = `ENX-VEN-${slug(name).replace(/\s+/g, '-')}`;
        let vendor = await Vendor.findOne({ vendorCode });
        if (!vendor) {
            vendor = await Vendor.create({
                vendorCode,
                name,
                isActive: true
            });
        }
        map.set(name, vendor);
    }
    return map;
}

function inferType(sheetName, tableTitle = '') {
    const text = `${sheetName} ${tableTitle}`.toUpperCase();
    if (text.includes('RESIST')) return 'RESISTOR';
    if (text.includes('CAPACITOR')) return 'CAPACITOR';
    if (text.includes('IC')) return 'IC';
    return 'OTHER_COMPONENT';
}

function findHeaderRows(rows) {
    const headers = [];
    rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
            if (String(cell).trim().toUpperCase() === 'S.NO') {
                headers.push({ rowIndex: rIdx, startCol: cIdx });
            }
        });
    });
    return headers;
}

function parseSheetRows(sheetName, rows) {
    const headers = findHeaderRows(rows);
    const parsed = [];

    for (const h of headers) {
        const headerRow = rows[h.rowIndex] || [];
        const titleRow = rows[h.rowIndex - 1] || [];
        const tableTitle = String(titleRow[h.startCol + 1] || titleRow[h.startCol] || '').trim();
        const type = inferType(sheetName, tableTitle);

        const nameCol = h.startCol + 1;
        const packageCol = h.startCol + 2;
        const qtyCol = h.startCol + 3;

        const vendorCols = {};
        for (let c = h.startCol; c < headerRow.length; c++) {
            const key = String(headerRow[c] || '').trim().toUpperCase();
            if (VENDOR_COLUMNS.includes(key)) vendorCols[key] = c;
        }

        for (let r = h.rowIndex + 1; r < rows.length; r++) {
            const row = rows[r] || [];
            const name = normName(row[nameCol]);
            const pkg = normPackage(row[packageCol]);
            const qty = toNumber(row[qtyCol]);
            const serial = String(row[h.startCol] || '').trim();

            if (!name && !pkg && !qty && !serial) continue;
            if (!name && !pkg) continue;

            const vendorSkus = {};
            Object.entries(vendorCols).forEach(([vendorName, col]) => {
                const skuRaw = row[col];
                const sku = String(skuRaw ?? '').trim();
                if (sku) vendorSkus[vendorName] = sku;
            });

            let finalName = name;
            if (type === 'RESISTOR' && !/resistor/i.test(finalName)) finalName = `${finalName} Resistor`;
            if (type === 'CAPACITOR' && !/capacitor/i.test(finalName)) finalName = `${finalName} Capacitor`;

            parsed.push({
                type,
                name: finalName,
                package: pkg,
                qty,
                vendorSkus
            });
        }
    }

    return parsed;
}

async function createItemCode(classification) {
    const seq = Number(classification.nextSequenceNumber || 1);
    classification.nextSequenceNumber = seq + 1;
    await classification.save();
    return `${classification.prefix}-${String(seq).padStart(6, '0')}`;
}

async function run() {
    await connectDB();
    const vendorMap = await ensureVendors();

    let defaultLocation = await StockLocation.findOne({ locationCode: 'SELF-1' });
    if (!defaultLocation) {
        defaultLocation = await StockLocation.create({
            locationCode: 'SELF-1',
            name: 'MAIN PRODUCTION',
            status: 'ACTIVE',
            isActive: true
        });
    }

    const wb = xlsx.readFile(FILE_PATH);
    const allRows = [];
    const sheetNames = SHEET_FILTER
        ? wb.SheetNames.filter((s) => s.toUpperCase() === SHEET_FILTER)
        : wb.SheetNames;

    if (SHEET_FILTER && sheetNames.length === 0) {
        throw new Error(`Sheet "${SHEET_FILTER}" not found in workbook.`);
    }

    for (const sheetName of sheetNames) {
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        allRows.push(...parseSheetRows(sheetName, rows));
    }

    const aggregate = new Map();
    for (const row of allRows) {
        const key = `${row.type}||${slug(row.name)}||${slug(row.package)}`;
        if (!aggregate.has(key)) {
            aggregate.set(key, {
                ...row,
                qty: 0,
                vendorSkus: {}
            });
        }
        const agg = aggregate.get(key);
        agg.qty += row.qty;
        Object.assign(agg.vendorSkus, row.vendorSkus);
    }

    let createdItems = 0;
    let updatedItems = 0;
    let updatedStock = 0;
    let upsertedSkus = 0;

    for (const record of aggregate.values()) {
        const cls = await ensureClassification(record.type);
        let item = await Item.findOne({
            classificationId: cls._id,
            name: record.name,
            package: record.package || ''
        });

        if (!item) {
            item = await Item.create({
                itemCode: await createItemCode(cls),
                classificationId: cls._id,
                name: record.name,
                package: record.package || '',
                uom: 'Nos',
                isActive: true
            });
            createdItems += 1;
        } else {
            updatedItems += 1;
        }

        await StockBalance.findOneAndUpdate(
            { itemId: item._id, locationId: defaultLocation._id },
            { $set: { quantityOnHand: record.qty, reservedQuantity: 0 } },
            { upsert: true, new: true }
        );
        updatedStock += 1;

        const embeddedMappings = [];
        for (const [vendorName, sku] of Object.entries(record.vendorSkus || {})) {
            const vendor = vendorMap.get(vendorName);
            if (!vendor || !sku) continue;
            await ItemVendorSku.findOneAndUpdate(
                { itemId: item._id, vendorId: vendor._id },
                { $set: { sku: String(sku) } },
                { upsert: true, new: true }
            );
            embeddedMappings.push({
                vendorId: vendor._id,
                sku: String(sku)
            });
            upsertedSkus += 1;
        }

        // Keep legacy embedded mappings in sync because current UI/API reads this field.
        item.skuMappings = embeddedMappings;
        await item.save();
    }

    console.log('Import complete');
    console.log(`Rows parsed: ${allRows.length}`);
    console.log(`Unique items: ${aggregate.size}`);
    console.log(`Items created: ${createdItems}`);
    console.log(`Items matched: ${updatedItems}`);
    console.log(`Stock balances updated: ${updatedStock}`);
    console.log(`Vendor SKU upserts: ${upsertedSkus}`);

    await mongoose.connection.close();
}

run().catch(async (err) => {
    console.error('Import failed:', err);
    try { await mongoose.connection.close(); } catch (_) {}
    process.exit(1);
});
