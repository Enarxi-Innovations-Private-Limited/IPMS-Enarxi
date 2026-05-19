const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_CANDIDATES = [
    'C:\\Users\\Hameed\\Downloads\\enarxi-front-logo-black-d1m9Cf6C.png',
    path.join(__dirname, '..', '..', 'client', 'public', 'enarxi-front-logo-black-d1m9Cf6C.png')
];

function resolveLogoPath() {
    return LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function formatCurrency(amount) {
    return `INR ${Number(amount || 0).toFixed(2)}`;
}

/**
 * Generates a professional branded Purchase Order PDF matching the premium UI
 * @param {Object} order - The Purchase Order document from MongoDB (populated)
 * @param {Object} stream - The Express response stream or write stream
 */
function generatePurchaseOrderPdf(order, stream) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const logoPath = resolveLogoPath();

    doc.pipe(stream);

    doc.rect(0, 0, doc.page.width, 8).fill('#0f172a');

    if (logoPath) {
        doc.image(logoPath, 50, 34, { fit: [180, 56], align: 'left', valign: 'center' });
    } else {
        doc.rect(50, 42, 54, 54).fill('#0f172a');
        doc.fontSize(14).fillColor('#ffffff').font('Helvetica-Bold').text('E', 70, 63);
        doc.fontSize(18).fillColor('#0f172a').font('Helvetica-Bold').text('ENARXI INNOVATIONS PVT LTD', 118, 55);
    }

    doc.fontSize(28)
        .fillColor('#0f172a')
        .font('Times-Bold')
        .text('PURCHASE ORDER', 250, 42, { align: 'right' });

    doc.fontSize(9)
        .fillColor('#94a3b8')
        .font('Helvetica-Bold')
        .text('PO NUMBER', 395, 88, { width: 70, align: 'right' })
        .text('DATE', 395, 102, { width: 70, align: 'right' })
        .text('STATUS', 395, 116, { width: 70, align: 'right' });

    doc.fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text(order.poNumber || '-', 470, 88, { width: 80, align: 'right' })
        .text(new Date(order.createdAt).toLocaleDateString(), 470, 102, { width: 80, align: 'right' })
        .text((order.status || 'DRAFT').toUpperCase(), 470, 116, { width: 80, align: 'right' });

    // --- VENDOR & SHIPPING CARDS ---
    const cardWidth = 245;
    const cardHeight = 108;
    const sectionTop = 156;

    // Vendor Card
    doc.roundedRect(50, sectionTop, cardWidth, cardHeight, 8).fillAndStroke('#f8fafc', '#dbe4f0');
    doc.fontSize(9).fillColor('#1e40af').font('Helvetica-Bold').text('VENDOR DETAILS', 65, sectionTop + 15);
    doc.moveTo(65, sectionTop + 34).lineTo(65 + cardWidth - 30, sectionTop + 34).strokeColor('#dbe4f0').stroke();

    doc.fontSize(15).fillColor('#0f172a').font('Helvetica-Bold').text(order.vendorId?.name || 'N/A', 65, sectionTop + 58);
    doc.fontSize(9).fillColor('#94a3b8').font('Helvetica-Bold').text('GSTIN', 65, sectionTop + 92);
    doc.fillColor('#0f172a').font('Helvetica').text(order.vendorId?.gstin || 'N/A', 102, sectionTop + 92);

    // Ship To Card
    doc.roundedRect(305, sectionTop, cardWidth, cardHeight, 8).fillAndStroke('#f8fafc', '#dbe4f0');
    doc.fontSize(9).fillColor('#1e40af').font('Helvetica-Bold').text('SHIP TO', 320, sectionTop + 15);
    doc.moveTo(320, sectionTop + 34).lineTo(320 + cardWidth - 30, sectionTop + 34).strokeColor('#dbe4f0').stroke();

    doc.fontSize(15)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text('Enarxi Innovations Pvt Ltd', 320, sectionTop + 58, { width: cardWidth - 30 });

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
           .font('Helvetica-Bold').text(formatCurrency(itemTotal), 470, currentY, { width: 70, align: 'right' });

        currentY += 40;
    });

    // --- SUMMARY SECTION ---
    const summaryWidth = 200;
    const summaryX = 350;
    currentY += 20;

    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    
    doc.text('SUBTOTAL:', summaryX, currentY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(subtotal), summaryX + 100, currentY, { align: 'right', width: 100 });

    currentY += 20;
    doc.fillColor('#64748b').font('Helvetica').text('TOTAL TAX (GST):', summaryX, currentY);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(totalGst), summaryX + 100, currentY, { align: 'right', width: 100 });

    currentY += 25;
    doc.rect(summaryX, currentY - 10, summaryWidth + 10, 35).fill('#f8fafc');
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('GRAND TOTAL:', summaryX + 10, currentY);
    doc.fontSize(12).text(formatCurrency(order.totalAmount || (subtotal + totalGst)), summaryX + 100, currentY, { align: 'right', width: 100 });

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
