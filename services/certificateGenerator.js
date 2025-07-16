import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import supabase from '../supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CertificateGenerator {
  constructor() {
    this.templatePath = path.join(__dirname, '../../template/template.pdf');
  }

  /**
   * Format date from YYYY-MM-DD to "1 July 2025" format
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month} ${year}`;
  }

  /**
   * Generate QR code as PNG buffer
   */
  async generateQRCode(certificateId) {
    try {
      const qrCodeBuffer = await QRCode.toBuffer(certificateId, {
        type: 'png',
        width: 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeBuffer;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate certificate for a student
   */
  async generateCertificate(studentData) {
    try {
      console.log('🎓 Starting certificate generation for:', studentData.preferred_name);
      
      // Read the template PDF
      const templateBytes = await fs.readFile(this.templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      
      // Get the first page
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      console.log(`📄 PDF dimensions: ${width} x ${height}`);
      
      // Embed fonts
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Format dates
      const startDate = this.formatDate(studentData.internship_start_date);
      const endDate = this.formatDate(studentData.internship_end_date);
      
      // Generate certificate text
      const certificateText = `${studentData.preferred_name}\nhas successfully completed a ${studentData.course_name} Internship at ${studentData.company_name},\nheld from ${startDate} to ${endDate}.`;
      
      console.log('📝 Certificate text:', certificateText);
      
      // Add student name (larger, bold)
      firstPage.drawText(studentData.preferred_name, {
        x: width / 2 - (studentData.preferred_name.length * 12), // Center approximately
        y: height / 2 + 50, // Adjust position as needed
        size: 24,
        font: helveticaBoldFont,
        color: rgb(0, 0, 0),
      });
      
      // Add completion text
      const completionText = `has successfully completed a ${studentData.course_name} Internship at ${studentData.company_name},`;
      firstPage.drawText(completionText, {
        x: width / 2 - (completionText.length * 4), // Center approximately
        y: height / 2 + 10,
        size: 14,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      // Add date range text
      const dateText = `held from ${startDate} to ${endDate}.`;
      firstPage.drawText(dateText, {
        x: width / 2 - (dateText.length * 4), // Center approximately
        y: height / 2 - 20,
        size: 14,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      // Generate and embed QR code
      const qrCodeBuffer = await this.generateQRCode(studentData.certificate_id);
      const qrCodeImage = await pdfDoc.embedPng(qrCodeBuffer);
      
      // Add QR code to top-right corner
      const qrSize = 80;
      firstPage.drawImage(qrCodeImage, {
        x: width - qrSize - 20, // 20px margin from right
        y: height - qrSize - 20, // 20px margin from top
        width: qrSize,
        height: qrSize,
      });
      
      console.log('✅ Certificate content added successfully');
      
      // Save the PDF as bytes
      const pdfBytes = await pdfDoc.save();
      
      console.log(`📊 Generated PDF size: ${pdfBytes.length} bytes`);
      
      return pdfBytes;
      
    } catch (error) {
      console.error('❌ Error generating certificate:', error);
      throw new Error(`Certificate generation failed: ${error.message}`);
    }
  }

  /**
   * Generate certificate and save to database
   */
  async generateAndSaveCertificate(studentId) {
    try {
      console.log(`🔍 Fetching student data for ID: ${studentId}`);
      
      // Fetch student data from Supabase
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('*')
        .eq('student_id', studentId)
        .single();
      
      if (fetchError) {
        console.error('❌ Error fetching student:', fetchError);
        throw new Error(`Failed to fetch student: ${fetchError.message}`);
      }
      
      if (!student) {
        throw new Error('Student not found');
      }
      
      console.log('👤 Student found:', student.preferred_name);
      
      // Validate required fields
      const requiredFields = ['preferred_name', 'course_name', 'internship_start_date', 'internship_end_date', 'company_name', 'certificate_id'];
      const missingFields = requiredFields.filter(field => !student[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Generate certificate PDF
      const certificateBytes = await this.generateCertificate(student);
      
      // Convert to Uint8Array for database storage
      const certificateBuffer = new Uint8Array(certificateBytes);
      
      console.log('💾 Saving certificate to database...');
      
      // Update student record with certificate
      const { data: updateData, error: updateError } = await supabase
        .from('students')
        .update({ 
          certificate: certificateBuffer
        })
        .eq('student_id', studentId)
        .select();
      
      if (updateError) {
        console.error('❌ Error saving certificate:', updateError);
        throw new Error(`Failed to save certificate: ${updateError.message}`);
      }
      
      console.log('✅ Certificate generated and saved successfully!');
      
      return {
        success: true,
        message: 'Certificate generated and saved successfully',
        student: student.preferred_name,
        certificateId: student.certificate_id,
        size: certificateBytes.length
      };
      
    } catch (error) {
      console.error('❌ Certificate generation process failed:', error);
      throw error;
    }
  }

  /**
   * Get certificate from database
   */
  async getCertificate(studentId) {
    try {
      const { data: student, error } = await supabase
        .from('students')
        .select('certificate, preferred_name, certificate_id')
        .eq('student_id', studentId)
        .single();
      
      if (error) {
        throw new Error(`Failed to fetch certificate: ${error.message}`);
      }
      
      if (!student || !student.certificate) {
        throw new Error('Certificate not found');
      }
      
      return {
        certificate: student.certificate,
        studentName: student.preferred_name,
        certificateId: student.certificate_id
      };
      
    } catch (error) {
      console.error('❌ Error fetching certificate:', error);
      throw error;
    }
  }
}

export default CertificateGenerator;