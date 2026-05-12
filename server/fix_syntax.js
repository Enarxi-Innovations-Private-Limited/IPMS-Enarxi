const fs = require('fs');
const path = 'd:\\users\\hameed\\Desktop\\Enarxi\\Project Management\\server\\inventoryRoutes.js';
let content = fs.readFileSync(path, 'utf8');

// Fix the unclosed submitStockAdjustment route
const broken = /(\s+\}\r?\n\s+\}\r?\n)\r?\n\/\/ --- Legacy Compatibility Aliases ---/;
const fixed = `            }
        }

        await batch.save();
        await logAudit('StockAdjustmentBatch', batch._id, 'CREATE', null, batch.toObject(), req);
        res.status(201).json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Legacy Compatibility Aliases ---`;

if (broken.test(content)) {
    content = content.replace(broken, fixed);
    fs.writeFileSync(path, content, 'utf8');
    console.log('SUCCESS: Fixed unclosed submitStockAdjustment route');
} else {
    console.log('PATTERN NOT FOUND - dumping context around line 920-930:');
    const lines = content.split('\n');
    for (let i = 919; i < 935 && i < lines.length; i++) {
        console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
    }
}
