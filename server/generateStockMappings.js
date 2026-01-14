const fs = require('fs');
const path = require('path');

/**
 * Automatically generates stock_mappings.json from components_data.json
 * This ensures all products in the database are available for price comparison
 */

const generateStockMappings = () => {
    try {
        // Read components data
        const componentsPath = path.join(__dirname, 'data', 'components_data.json');
        const componentsData = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));

        console.log(`📦 Found ${componentsData.length} components to process...\n`);

        // Transform to stock mappings format
        const stockMappings = componentsData.map((component, index) => {
            const mapping = {
                product: component.value,
                footprint: component.footprint,
                skus: {}
            };

            // Add vendor SKUs (only if not null)
            if (component.vendors.evelta) {
                mapping.skus.evelta = component.vendors.evelta;
            }
            if (component.vendors.ktron) {
                mapping.skus.ktron = component.vendors.ktron;
            }
            if (component.vendors.robu) {
                mapping.skus.robu = component.vendors.robu;
            }
            if (component.vendors.sharvi) {
                mapping.skus.sharvi = component.vendors.sharvi;
            }

            // Log progress
            console.log(`✓ Mapped ${component.value} (${component.footprint})`);

            return mapping;
        });

        // Write to stock_mappings.json
        const outputPath = path.join(__dirname, 'data', 'stock_mappings.json');
        fs.writeFileSync(outputPath, JSON.stringify(stockMappings, null, 4), 'utf8');

        console.log(`\n✅ Successfully generated stock_mappings.json with ${stockMappings.length} products!`);
        console.log(`📍 Output: ${outputPath}\n`);

        // Summary
        const vendorCounts = {
            evelta: 0,
            ktron: 0,
            robu: 0,
            sharvi: 0
        };

        stockMappings.forEach(mapping => {
            if (mapping.skus.evelta) vendorCounts.evelta++;
            if (mapping.skus.ktron) vendorCounts.ktron++;
            if (mapping.skus.robu) vendorCounts.robu++;
            if (mapping.skus.sharvi) vendorCounts.sharvi++;
        });

        console.log('📊 Vendor Coverage:');
        console.log(`   - Evelta: ${vendorCounts.evelta} products`);
        console.log(`   - Ktron:  ${vendorCounts.ktron} products`);
        console.log(`   - Robu:   ${vendorCounts.robu} products`);
        console.log(`   - Sharvi: ${vendorCounts.sharvi} products\n`);

    } catch (error) {
        console.error('❌ Error generating stock mappings:', error.message);
        process.exit(1);
    }
};

// Run the generator
generateStockMappings();
