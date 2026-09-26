import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { templateConfig } from './config/templateConfig.js';
import { getSettings } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to convert hex color to pdf-lib rgb format
const hexToRgb = (hex) => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
};

// Helper to load and embed custom fonts if they exist
const getFont = async (pdfDoc, fontName, uploadsDir) => {
  try {
    // 1. Standard PDF Fonts mapping
    if (fontName === 'Helvetica') return await pdfDoc.embedFont(StandardFonts.Helvetica);
    if (fontName === 'Helvetica-Bold') return await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    if (fontName === 'Times-Roman') return await pdfDoc.embedFont(StandardFonts.TimesRoman);
    if (fontName === 'Times-Bold') return await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    if (fontName === 'Courier') return await pdfDoc.embedFont(StandardFonts.Courier);
    if (fontName === 'Courier-Bold') return await pdfDoc.embedFont(StandardFonts.CourierBold);

    // 2. Look for custom font file in uploads/fonts
    const fontPath = path.join(uploadsDir, 'fonts', fontName);
    if (fs.existsSync(fontPath)) {
      const fontBytes = fs.readFileSync(fontPath);
      return await pdfDoc.embedFont(fontBytes);
    }
  } catch (error) {
    console.error(`Error embedding font ${fontName}:`, error);
  }
  // Fallback to standard Helvetica
  return await pdfDoc.embedFont(StandardFonts.Helvetica);
};

/**
 * Main PDF Generation Function
 * @param {Object} data Intern form values
 * @param {string} docType 'offer_letter' | 'certificate'
 * @param {boolean} isPreview If true, generate preview (uses temporary ID, no DB write)
 * @returns {Promise<Buffer>} PDF output buffer
 */
export const generatePDF = async (data, docType, isPreview = false) => {
  const settings = await getSettings();
  const config = templateConfig[docType];
  const uploadsDir = path.resolve(__dirname, '../uploads');
  const projectRootDir = path.resolve(__dirname, '..');

  if (!config) {
    throw new Error(`Invalid document type: ${docType}`);
  }

  // Determine template file path
  // Allow template overrides from templates/ folder or custom upload in settings
  const customTemplatePath = docType === 'offer_letter' 
    ? settings.offer_letter_template 
    : settings.certificate_template;
  
  const templatePath = customTemplatePath 
    ? path.resolve(projectRootDir, customTemplatePath)
    : path.resolve(projectRootDir, config.templatePath);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at: ${templatePath}`);
  }

  let pdfDoc;
  let page;
  let width, height;

  const fileExt = path.extname(templatePath).toLowerCase();

  // 1. Initialize PDF Document
  if (fileExt === '.pdf') {
    const templateBytes = fs.readFileSync(templatePath);
    const externalDoc = await PDFDocument.load(templateBytes);
    pdfDoc = await PDFDocument.create();
    
    // Copy the first page of the template
    const [copiedPage] = await pdfDoc.copyPages(externalDoc, [0]);
    pdfDoc.addPage(copiedPage);
    page = pdfDoc.getPages()[0];
    const size = page.getSize();
    width = size.width;
    height = size.height;
  } else if (fileExt === '.png' || fileExt === '.jpg' || fileExt === '.jpeg') {
    pdfDoc = await PDFDocument.create();
    const imageBytes = fs.readFileSync(templatePath);
    
    let bgImage;
    if (fileExt === '.png') {
      bgImage = await pdfDoc.embedPng(imageBytes);
    } else {
      bgImage = await pdfDoc.embedJpg(imageBytes);
    }

    // Use dimensions from config or scale image dimensions
    width = config.defaultWidth || bgImage.width;
    height = config.defaultHeight || bgImage.height;

    page = pdfDoc.addPage([width, height]);
    page.drawImage(bgImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });
  } else {
    throw new Error(`Unsupported template file extension: ${fileExt}`);
  }

  // 2. Prepare Form Field Values
  const fields = config.fields;
  const values = {
    ...data,
    companyName: data.companyName || settings.company_name,
    companyAddress: settings.company_address,
    companyEmail: settings.company_email,
    companyWebsite: settings.company_website,
    companyPhone: settings.company_phone,
  };

  // Format/convert duration for Certificate (e.g. '3 Months' or '3' -> '90 Days')
  if (docType === 'certificate' && values.duration) {
    const rawDuration = String(values.duration).trim();
    if (/days/i.test(rawDuration)) {
      values.duration = rawDuration;
    } else {
      const match = rawDuration.match(/\d+(\.\d+)?/);
      if (match) {
        const months = parseFloat(match[0]);
        values.duration = `${Math.round(months * 30)} Days`;
      } else {
        values.duration = rawDuration;
      }
    }
  }

  // Ensure formatted Intern ID is ready
  const formattedId = docType === 'offer_letter' 
    ? `INTERN-${data.internId}` 
    : `CERT-${data.internId}`;
  
  values.internId = formattedId;

  // 3. Draw Text Overlays
  for (const [fieldName, fieldConfig] of Object.entries(fields)) {
    if (fieldConfig.type === 'image') continue; // Images are handled separately

    const value = values[fieldName];
    if (value === undefined || value === null) continue;
    const textValue = String(value);

    // Get position in PDF points
    const pdfX = (fieldConfig.x / 100) * width;
    const pdfY = ((100 - fieldConfig.y) / 100) * height;

    const font = await getFont(pdfDoc, fieldConfig.fontFamily || 'Helvetica', uploadsDir);
    const fontSize = fieldConfig.fontSize || 11;
    const color = hexToRgb(fieldConfig.color || '#000000');

    // Calculate alignment offsets
    let drawX = pdfX;
    const textWidth = font.widthOfTextAtSize(textValue, fontSize);
    
    if (fieldConfig.alignment === 'center') {
      drawX = pdfX - (textWidth / 2);
    } else if (fieldConfig.alignment === 'right') {
      drawX = pdfX - textWidth;
    }

    // Align vertical origin by subtracting ~80% of font size (descender/baseline offset)
    const drawY = pdfY - (fontSize * 0.8);

    // Digital whiteout for template placeholders
    if (docType === 'offer_letter') {
      const placeholderText = `{${fieldName}}`;
      const placeholderWidth = font.widthOfTextAtSize(placeholderText, fontSize);
      
      const boxWidth = Math.max(textWidth, placeholderWidth) + 10;
      const boxHeight = fontSize + 6;
      
      let boxX = pdfX;
      if (fieldConfig.alignment === 'center') {
        boxX = pdfX - (boxWidth / 2);
      } else if (fieldConfig.alignment === 'right') {
        boxX = pdfX - boxWidth + 5;
      } else {
        boxX = pdfX - 5;
      }
      
      page.drawRectangle({
        x: boxX,
        y: drawY - 4,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
      });
    }

    // Digital whiteout for Certificate Template placeholders
    if (docType === 'certificate' && path.basename(templatePath) === 'certificate_template.png') {
      const bgColor = fieldName === 'documentDate' ? rgb(0, 0, 0) : rgb(1, 1, 1);
      const placeholderWidth = font.widthOfTextAtSize(`{${fieldName}}`, fontSize);
      const boxWidth = Math.max(textWidth, placeholderWidth) + 30; // generous padding to cover original placeholder
      const boxHeight = fontSize * 1.5;
      
      let boxX = drawX - 15;
      if (fieldConfig.alignment === 'center') {
        boxX = pdfX - (boxWidth / 2);
      } else if (fieldConfig.alignment === 'right') {
        boxX = pdfX - boxWidth + 15;
      }

      page.drawRectangle({
        x: boxX,
        y: drawY - (fontSize * 0.3),
        width: boxWidth,
        height: boxHeight,
        color: bgColor
      });
    }

    page.drawText(textValue, {
      x: drawX,
      y: drawY,
      size: fontSize,
      font: font,
      color: color,
    });
  }

  // 4. Draw QR Code (Only if config has qrCode and is Certificate)
  if (fields.qrCode) {
    const qrConfig = fields.qrCode;
    const verificationUrl = `${settings.verification_base_url}/${data.internId}`;
    
    // Generate QR Code Buffer
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
      margin: 1,
      width: 150,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const qrImage = await pdfDoc.embedPng(qrBuffer);
    
    const qrX = (qrConfig.x / 100) * width - (qrConfig.width / 2);
    // Remember PDF coordinate system origin is bottom-left, so we subtract size to position top-left
    const qrY = ((100 - qrConfig.y) / 100) * height - qrConfig.height;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrConfig.width,
      height: qrConfig.height,
    });
  }

  // 5. Draw CEO Signature (If config has ceoSignature and signature exists)
  if (fields.ceoSignature && settings.ceo_signature_path) {
    const sigConfig = fields.ceoSignature;
    const sigFullPath = path.resolve(projectRootDir, settings.ceo_signature_path);

    if (fs.existsSync(sigFullPath)) {
      const sigBytes = fs.readFileSync(sigFullPath);
      const sigExt = path.extname(sigFullPath).toLowerCase();
      
      let sigImage;
      try {
        if (sigExt === '.png') {
          sigImage = await pdfDoc.embedPng(sigBytes);
        } else if (sigExt === '.jpg' || sigExt === '.jpeg') {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        }

        if (sigImage) {
          const sigX = (sigConfig.x / 100) * width - (sigConfig.width / 2);
          const sigY = ((100 - sigConfig.y) / 100) * height - sigConfig.height;

          page.drawImage(sigImage, {
            x: sigX,
            y: sigY,
            width: sigConfig.width,
            height: sigConfig.height,
          });
        }
      } catch (error) {
        console.error('Failed to embed CEO Signature image:', error);
      }
    }
  }

  // 6. Draw Watermark if enabled (Semi-transparent diagonal "DRAFT")
  const watermarkEnabled = settings.enable_draft_watermark === 1;
  if (watermarkEnabled) {
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const watermarkText = 'DRAFT';
    const size = Math.floor(Math.min(width, height) * 0.15); // Dynamic size relative to page dimensions (~80-120 pt)
    const textWidth = helveticaBold.widthOfTextAtSize(watermarkText, size);
    const textHeight = helveticaBold.heightAtSize(size);
    
    // Draw on all pages
    const allPages = pdfDoc.getPages();
    allPages.forEach((p) => {
      const pSize = p.getSize();
      const pWidth = pSize.width;
      const pHeight = pSize.height;

      // Draw watermark centered diagonally
      p.drawText(watermarkText, {
        x: (pWidth / 2) - (textWidth / 2) + 30, // shift slightly to center rotation point
        y: (pHeight / 2) - (textHeight / 2) - 30,
        size: size,
        font: helveticaBold,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.12, // 12% opacity
        rotate: degrees(45), // Diagonal rotation
      });
    });
  }

  // 7. Save PDF and return buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};
