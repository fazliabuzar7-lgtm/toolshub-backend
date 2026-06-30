/**
 * ════════════════════════════════════════════
 * PDF Routes — REAL processing, no fake/simulated output
 * Each endpoint: validate → process → return downloadable file → auto-cleanup
 * ════════════════════════════════════════════
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const archiver = require('archiver');
const upload = require('../utils/upload');

const OUTPUT_DIR = path.join(__dirname, '..', 'outputs');

function buildFileUrl(req, filename) {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/files/${filename}`;
}

router.post('/to-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (req.file.mimetype !== 'application/pdf') {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Please upload a valid PDF file.' });
    }

    const { Document, Packer, Paragraph, TextRun } = require('docx');

    const dataBuffer = await fs.readFile(req.file.path);
    const pdfData = await pdfParse(dataBuffer);

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      await fs.remove(req.file.path);
      return res.status(422).json({
        error: 'This PDF appears to be scanned/image-only with no extractable text. Try the OCR tool instead.',
      });
    }

    const paragraphs = pdfData.text
      .split(/\n+/)
      .filter((line) => line.trim().length > 0)
      .map((line) => new Paragraph({ children: [new TextRun(line.trim())] }));

    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(doc);
    const outFilename = `converted-${uuidv4()}.docx`;
    const outPath = path.join(OUTPUT_DIR, outFilename);
    await fs.writeFile(outPath, buffer);

    await fs.remove(req.file.path);

    res.json({
      success: true,
      message: 'PDF converted to Word successfully.',
      filename: outFilename,
      downloadUrl: buildFileUrl(req, outFilename),
      pages: pdfData.numpages,
    });
  } catch (err) {
    console.error('PDF to Word error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to convert PDF. The file may be corrupted or password-protected.' });
  }
});

router.post('/merge', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      if (req.files) await Promise.all(req.files.map((f) => fs.remove(f.path)));
      return res.status(400).json({ error: 'Please upload at least 2 PDF files to merge.' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      if (file.mimetype !== 'application/pdf') continue;
      const bytes = await fs.readFile(file.path);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const outFilename = `merged-${uuidv4()}.pdf`;
    const outPath = path.join(OUTPUT_DIR, outFilename);
    await fs.writeFile(outPath, mergedBytes);

    await Promise.all(req.files.map((f) => fs.remove(f.path)));

    res.json({
      success: true,
      message: `${req.files.length} PDFs merged successfully.`,
      filename: outFilename,
      downloadUrl: buildFileUrl(req, outFilename),
      totalPages: mergedPdf.getPageCount(),
    });
  } catch (err) {
    console.error('Merge PDF error:', err.message);
    if (req.files) await Promise.all(req.files.map((f) => fs.remove(f.path).catch(() => {})));
    res.status(500).json({ error: 'Failed to merge PDFs. One or more files may be corrupted.' });
  }
});

router.post('/split', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const bytes = await fs.readFile(req.file.path);
    const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = srcPdf.getPageCount();

    if (pageCount < 2) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'PDF must have at least 2 pages to split.' });
    }

    const zipFilename = `split-${uuidv4()}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipFilename);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (let i = 0; i < pageCount; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(srcPdf, [i]);
      newPdf.addPage(copiedPage);
      const pageBytes = await newPdf.save();
      archive.append(Buffer.from(pageBytes), { name: `page-${i + 1}.pdf` });
    }

    await archive.finalize();

    output.on('close', async () => {
      await fs.remove(req.file.path);
      res.json({
        success: true,
        message: `PDF split into ${pageCount} pages.`,
        filename: zipFilename,
        downloadUrl: buildFileUrl(req, zipFilename),
        totalPages: pageCount,
      });
    });
  } catch (err) {
    console.error('Split PDF error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to split PDF.' });
  }
});

router.post('/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const originalSize = req.file.size;
    const bytes = await fs.readFile(req.file.path);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

    const compressedBytes = await pdf.save({ useObjectStreams: true });

    const outFilename = `compressed-${uuidv4()}.pdf`;
    const outPath = path.join(OUTPUT_DIR, outFilename);
    await fs.writeFile(outPath, compressedBytes);

    const compressedSize = compressedBytes.length;
    const savedPercent = Math.max(0, Math.round((1 - compressedSize / originalSize) * 100));

    await fs.remove(req.file.path);

    res.json({
      success: true,
      message: 'PDF compressed successfully.',
      filename: outFilename,
      downloadUrl: buildFileUrl(req, outFilename),
      originalSize,
      compressedSize,
      savedPercent,
    });
  } catch (err) {
    console.error('Compress PDF error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to compress PDF.' });
  }
});

router.post('/watermark', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const text = (req.body.text || 'CONFIDENTIAL').slice(0, 50);
    const opacity = Math.min(1, Math.max(0.1, parseFloat(req.body.opacity) / 100 || 0.4));

    const bytes = await fs.readFile(req.file.path);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pages = pdf.getPages();
    pages.forEach((page) => {
      const { width, height } = page.getSize();
      const fontSize = Math.min(width, height) / 10;
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size: fontSize,
        font,
        color: rgb(0.6, 0.6, 0.6),
        opacity,
        rotate: degrees(45),
      });
    });

    const outBytes = await pdf.save();
    const outFilename = `watermarked-${uuidv4()}.pdf`;
    const outPath = path.join(OUTPUT_DIR, outFilename);
    await fs.writeFile(outPath, outBytes);

    await fs.remove(req.file.path);

    res.json({
      success: true,
      message: 'Watermark added successfully.',
      filename: outFilename,
      downloadUrl: buildFileUrl(req, outFilename),
    });
  } catch (err) {
    console.error('Watermark PDF error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to add watermark.' });
  }
});

router.post('/to-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const dataBuffer = await fs.readFile(req.file.path);
    const pdfData = await pdfParse(dataBuffer);

    await fs.remove(req.file.path);

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      return res.status(422).json({
        error: 'No extractable text found. This may be a scanned PDF — try the OCR tool instead.',
      });
    }

    res.json({
      success: true,
      message: 'Text extracted successfully.',
      text: pdfData.text.trim(),
      pages: pdfData.numpages,
      wordCount: pdfData.text.trim().split(/\s+/).length,
    });
  } catch (err) {
    console.error('PDF to Text error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to extract text. File may be corrupted or encrypted.' });
  }
});

router.post('/rotate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const angle = parseInt(req.body.angle) || 90;
    const bytes = await fs.readFile(req.file.path);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

    pdf.getPages().forEach((page) => {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + angle) % 360));
    });

    const outBytes = await pdf.save();
    const outFilename = `rotated-${uuidv4()}.pdf`;
    const outPath = path.join(OUTPUT_DIR, outFilename);
    await fs.writeFile(outPath, outBytes);

    await fs.remove(req.file.path);

    res.json({
      success: true,
      message: `PDF rotated ${angle}° successfully.`,
      filename: outFilename,
      downloadUrl: buildFileUrl(req, outFilename),
    });
  } catch (err) {
    console.error('Rotate PDF error:', err.message);
    if (req.file) await fs.remove(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Failed to rotate PDF.' });
  }
});

module.exports = router;
