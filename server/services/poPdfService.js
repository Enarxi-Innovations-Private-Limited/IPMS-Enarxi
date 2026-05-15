const PDFDocument = require('pdfkit');

/**
 * Generates a professional branded Purchase Order PDF
 * @param {Object} order - The Purchase Order document from MongoDB (populated)
 * @param {Object} stream - The Express response stream or write stream
 */
function generatePurchaseOrderPdf(order, stream) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.pipe(stream);

    // --- HEADER SECTION ---
    // Title in the top right
    doc.fontSize(24)
       .fillColor('#2b45a2')
       .font('Helvetica-Bold')
       .text('PURCHASE ORDER', 300, 50, { align: 'right' });

    // Company Branding in the top left
    doc.fontSize(18)
       .fillColor('#1a1a1a')
       .font('Helvetica-Bold')
       .text('ENARXI INNOVATIONS PVT LTD', 50, 50);
    
    doc.fontSize(9)
       .fillColor('#666666')
       .font('Helvetica')
       .text('No. 23, Sripuram Colony, Vairalur,', 50, 72)
       .text('St. Thomas Mount, Chennai - 600016', 50, 84)
       .text('Ph: +91-9600676639 | info@enarxi.com', 50, 96);

    // PO Metadata below the Title
    doc.fontSize(10)
       .fillColor('#333333')
       .font('Helvetica-Bold')
       .text(`PO Number: ${order.poNumber}`, 350, 85, { align: 'right' })
       .font('Helvetica')
       .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 350, 98, { align: 'right' })
       .text(`Status: ${order.status}`, 350, 111, { align: 'right' });

    doc.moveTo(50, 135).lineTo(550, 135).strokeColor('#eeeeee').stroke();

    // --- VENDOR & SHIPPING SECTION ---
    const columnWidth = 240;
    const sectionTop = 155;

    // Vendor Details
    doc.fontSize(11)
       .fillColor('#2b45a2')
       .font('Helvetica-Bold')
       .text('VENDOR DETAILS', 50, sectionTop);
    
    doc.fontSize(10)
       .fillColor('#1a1a1a')
       .font('Helvetica-Bold')
       .text(order.vendorId?.name || 'N/A', 50, sectionTop + 18);
    
    doc.font('Helvetica')
       .fillColor('#444444')
       .text(order.vendorId?.address || 'Address not provided', 50, sectionTop + 32, { width: columnWidth })
       .text(`GSTIN: ${order.vendorId?.gstin || 'N/A'}`, 50, sectionTop + 58);

    // Ship To Details
    doc.fontSize(11)
       .fillColor('#2b45a2')
       .font('Helvetica-Bold')
       .text('SHIP TO', 310, sectionTop);
    
    doc.fontSize(10)
       .fillColor('#1a1a1a')
       .font('Helvetica-Bold')
       .text('Enarxi Operations Hub', 310, sectionTop + 18);
    
    doc.font('Helvetica')
       .fillColor('#444444')
       .text('Warehouse Wing B, Sector 5\nContact: Logistics Dept', 310, sectionTop + 32, { width: columnWidth });

    // --- ITEMS TABLE ---
    const tableTop = 250;
    
    // Table Header Background
    doc.rect(50, tableTop, 500, 20).fill('#f8f9fa');
    
    doc.fontSize(9)
       .fillColor('#666666')
       .font('Helvetica-Bold')
       .text('Item / SKU', 60, tableTop + 6)
       .text('Qty', 350, tableTop + 6, { width: 40, align: 'right' })
       .text('Rate', 400, tableTop + 6, { width: 50, align: 'right' })
       .text('GST%', 460, tableTop + 6, { width: 40, align: 'right' })
       .text('Total', 510, tableTop + 6, { width: 40, align: 'right' });

    let currentY = tableTop + 25;
    let subtotal = 0;
    let totalGst = 0;

    order.lines.forEach((line) => {
        const itemTotal = Number(line.lineTotal);
        const itemRate = Number(line.rate);
        const lineQty = Number(line.orderQuantity);
        const lineSubtotal = itemRate * lineQty;
        const lineGst = itemTotal - lineSubtotal;

        subtotal += lineSubtotal;
        totalGst += lineGst;

        doc.fontSize(10)
           .fillColor('#1a1a1a')
           .font('Helvetica-Bold')
           .text(line.itemId?.name || 'Unknown Item', 60, currentY);
        
        doc.fontSize(8)
           .fillColor('#999999')
           .font('Helvetica')
           .text(line.itemId?.itemCode || '', 60, currentY + 11);

        doc.fontSize(10)
           .fillColor('#333333')
           .text(lineQty.toString(), 350, currentY, { width: 40, align: 'right' })
           .text(itemRate.toFixed(2), 400, currentY, { width: 50, align: 'right' })
           .text(`${line.gstPercent}%`, 460, currentY, { width: 40, align: 'right' })
           .text(itemTotal.toFixed(2), 510, currentY, { width: 40, align: 'right' });

        currentY += 30;

        // Add page if content overflows
        if (currentY > 750) {
            doc.addPage();
            currentY = 50;
        }
    });

    // --- TOTALS SECTION ---
    const totalsTop = currentY + 20;
    doc.moveTo(310, totalsTop).lineTo(550, totalsTop).strokeColor('#2b45a2').stroke();

    doc.fontSize(10).fillColor('#444444');
    
    doc.font('Helvetica').text('Subtotal:', 350, totalsTop + 10);
    doc.font('Helvetica-Bold').text(`INR ${subtotal.toFixed(2)}`, 450, totalsTop + 10, { align: 'right' });

    doc.font('Helvetica').text('Total Tax (GST):', 350, totalsTop + 25);
    doc.font('Helvetica-Bold').text(`INR ${totalGst.toFixed(2)}`, 450, totalsTop + 25, { align: 'right' });

    // Grand Total Box
    doc.rect(310, totalsTop + 45, 240, 30).fill('#2b45a2');
    doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('GRAND TOTAL:', 320, totalsTop + 55);
    doc.text(`INR ${Number(order.totalAmount || (subtotal + totalGst)).toFixed(2)}`, 440, totalsTop + 55, { align: 'right', width: 100 });

    // --- FOOTER SECTION ---
    doc.fontSize(9)
       .fillColor('#999999')
       .font('Helvetica')
       .text('Notes:', 50, 700)
       .text('1. Please quote PO number on all invoices.', 50, 715)
       .text('2. Goods must be delivered in good condition.', 50, 727)
       .text('3. This is a computer-generated document and does not require a physical signature.', 50, 739);

    doc.end();
}

module.exports = { generatePurchaseOrderPdf };
