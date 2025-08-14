const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cheerio = require('cheerio');

class FileParser {
  // Parse different file types
  static async parseFile(filePath, fileType) {
    try {
      switch (fileType.toLowerCase()) {
        case 'pdf':
          return await this.parsePDF(filePath);
        case 'docx':
          return await this.parseDOCX(filePath);
        case 'txt':
          return await this.parseTXT(filePath);
        case 'html':
          return await this.parseHTML(filePath);
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error(`Error parsing ${fileType} file:`, error.message);
      throw error;
    }
  }

  // Parse PDF files
  static async parsePDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return {
        content: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  // Parse DOCX files
  static async parseDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return {
        content: result.value,
        metadata: {
          messages: result.messages
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error.message}`);
    }
  }

  // Parse TXT files
  static async parseTXT(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        content: content,
        metadata: {
          encoding: 'utf8'
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse TXT: ${error.message}`);
    }
  }

  // Parse HTML files
  static async parseHTML(filePath) {
    try {
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const $ = cheerio.load(htmlContent);
      
      // Remove script and style elements
      $('script, style').remove();
      
      // Extract text content
      const content = $('body').text() || $.text();
      
      // Clean up whitespace
      const cleanContent = content.replace(/\s+/g, ' ').trim();
      
      return {
        content: cleanContent,
        metadata: {
          title: $('title').text() || '',
          description: $('meta[name="description"]').attr('content') || ''
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse HTML: ${error.message}`);
    }
  }

  // Validate file type
  static isValidFileType(fileName) {
    const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'docx', 'txt', 'html'];
    const fileExtension = path.extname(fileName).toLowerCase().substring(1);
    return allowedTypes.includes(fileExtension);
  }

  // Get file type from filename
  static getFileType(fileName) {
    return path.extname(fileName).toLowerCase().substring(1);
  }

  // Validate file size
  static isValidFileSize(fileSize) {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default
    return fileSize <= maxSize;
  }

  // Clean and normalize text content
  static cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\r/g, '\n')    // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')  // Reduce multiple newlines
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }
}

module.exports = FileParser;