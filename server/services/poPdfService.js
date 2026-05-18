const PDFDocument = require('pdfkit');

/**
 * Generates a professional branded Purchase Order PDF matching the premium UI
 * @param {Object} order - The Purchase Order document from MongoDB (populated)
 * @param {Object} stream - The Express response stream or write stream
 */
function generatePurchaseOrderPdf(order, stream) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    doc.pipe(stream);

    // --- HEADER SECTION ---
    // Logo Placeholder Box (Top Left)
    doc.rect(50, 50, 50, 50).fill('#0f172a');
    doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold').text('E', 68, 68);

    // Company Branding
    doc.fontSize(16)
       .fillColor('#0f172a')
       .font('Helvetica-Bold')
       .text('ENARXI INNOVATIONS PVT LTD', 115, 50);
    
    doc.fontSize(8)
       .fillColor('#64748b')
       .font('Helvetica')
       .text('No. 23, Sripuram Colony, Vairalur,', 115, 70)
       .text('St. Thomas Mount, Chennai - 600016', 115, 80)
       .text('Ph: +91-9600676639 | info@enarxi.com', 115, 90);

    // Title and Metadata (Top Right)
    doc.fontSize(28)
       .fillColor('#1e3a8a')
       .font('Helvetica-Bold')
       .text('PURCHASE ORDER', 250, 50, { align: 'right' });

    doc.fontSize(9)
       .fillColor('#64748b')
       .font('Helvetica-Bold')
       .text(`PO NUMBER: `, 380, 90, { continued: true, align: 'right' })
       .fillColor('#0f172a').text(order.poNumber)
       .fillColor('#64748b').text(`DATE: `, 380, 102, { continued: true, align: 'right' })
       .fillColor('#0f172a').text(new Date(order.createdAt).toLocaleDateString())
       .fillColor('#64748b').text(`STATUS: `, 380, 114, { continued: true, align: 'right' })
       .fillColor('#0f172a').text((order.status || 'DRAFT').toUpperCase());

    // --- VENDOR & SHIPPING CARDS ---
    const cardWidth = 245;
    const cardHeight = 110;
    const sectionTop = 160;

    // Vendor Card
    doc.roundedRect(50, sectionTop, cardWidth, cardHeight, 8).fill('#f8fafc');
    doc.fontSize(9).fillColor('#1e40af').font('Helvetica-Bold').text('VENDOR DETAILS', 65, sectionTop + 15);
    
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text(order.vendorId?.name || 'N/A', 65, sectionTop + 35);
    doc.fontSize(9).fillColor('#64748b').font('Helvetica')
       .text(order.vendorId?.address || 'Address not provided', 65, sectionTop + 52, { width: cardWidth - 30 })
       .moveDown(0.5)
       .text(`GSTIN: `, { continued: true }).fillColor('#0f172a').font('Helvetica-Bold').text(order.vendorId?.gstin || 'N/A');

    // Ship To Card
    doc.roundedRect(305, sectionTop, cardWidth, cardHeight, 8).fill('#f8fafc');
    doc.fontSize(9).fillColor('#1e40af').font('Helvetica-Bold').text('SHIP TO', 320, sectionTop + 15);
    
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold').text('Enarxi Operations Hub', 320, sectionTop + 35);
    doc.fontSize(9).fillColor('#64748b').font('Helvetica')
       .text('Warehouse Wing B, Sector 5, Logistics Park\nChennai - 600096', 320, sectionTop + 52, { width: cardWidth - 30 })
       .moveDown(0.5)
       .text(`Contact: `, { continued: true }).fillColor('#0f172a').font('Helvetica-Bold').text('Logistics Dept');

    // --- ITEMS TABLE ---
    const tableTop = 300;
    
    // Table Header
    doc.rect(50, tableTop, 500, 25).fill('#f1f5f9');
    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold');
    doc.text('ITEM / SKU', 65, tableTop + 9);
    doc.text('QTY', 330, tableTop + 9, { width: 50, align: 'center' });
    doc.text('RATE', 380, tableTop + 9, { width: 60, align: 'right' });
    doc.text('GST%', 450, tableTop + 9, { width: 40, align: 'right' });
    doc.text('TOTAL', 500, tableTop + 9, { width: 40, align: 'right' });

    let currentY = tableTop + 35;
    let subtotal = 0;
    let totalGst = 0;

    order.lines.forEach((line) => {
        const itemTotal = Number(line.lineTotal || 0);
        const itemRate = Number(line.rate || 0);
        const lineQty = Number(line.orderQuantity || 0);
        const lineSubtotal = itemRate * lineQty;
        const lineGst = itemTotal - lineSubtotal;

        subtotal += lineSubtotal;
        totalGst += lineGst;

        // Check for page overflow
        if (currentY > 720) {
            doc.addPage();
            currentY = 50;
            // Redraw header on new page
            doc.rect(50, currentY, 500, 25).fill('#f1f5f9');
            doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold');
            doc.text('ITEM / SKU', 65, currentY + 9);
            currentY += 35;
        }

        doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text(line.itemId?.name || 'Unknown Item', 65, currentY);
        doc.fontSize(8).fillColor('#94a3b8').font('Helvetica').text(line.itemId?.itemCode || '', 65, currentY + 11);

        doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
           .text(lineQty.toString(), 330, currentY, { width: 50, align: 'center' })
           .font('Helvetica').text(itemRate.toFixed(2), 380, currentY, { width: 60, align: 'right' })
           .text(`${line.gstPercent}%`, 450, currentY, { width: 40, align: 'right' })
           .font('Helvetica-Bold').text(`INR ${itemTotal.toFixed(2)}`, 500, currentY, { width: 40, align: 'right' });

        currentY += 40;
    });

    // --- SUMMARY SECTION ---
    const summaryWidth = 200;
    const summaryX = 350;
    currentY += 20;

    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    
    doc.text('SUBTOTAL:', summaryX, currentY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`INR ${subtotal.toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 100 });

    currentY += 20;
    doc.fillColor('#64748b').font('Helvetica').text('TOTAL TAX (GST):', summaryX, currentY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`INR ${totalGst.toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 100 });

    currentY += 25;
    doc.rect(summaryX, currentY - 10, summaryWidth + 10, 35).fill('#f8fafc');
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('GRAND TOTAL:', summaryX + 10, currentY);
    doc.fontSize(12).text(`INR ${Number(order.totalAmount || (subtotal + totalGst)).toFixed(2)}`, summaryX + 100, currentY, { align: 'right', width: 100 });

    // --- FOOTER ---
    doc.fontSize(8)
       .fillColor('#94a3b8')
       .font('Helvetica')
       .text('Notes:', 50, 750)
       .text('1. Please quote PO number on all invoices.', 50, 762)
       .text('2. Goods must be delivered in good condition.', 50, 772)
       .text('3. This is a computer-generated document and does not require a signature.', 50, 782);

    doc.end();
}

module.exports = { generatePurchaseOrderPdf };
