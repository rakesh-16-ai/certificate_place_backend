import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import certificatesRoutes from './routes/certificates.js';
import supabase from './supabaseClient.js';
import { WorkingOtpService } from './test-otp.js';
import CertificateGenerator from './services/certificateGenerator.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/v1/auth', authRoutes);
app.use('/v1/certificates', certificatesRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test Supabase connection
    const { data, error } = await supabase
      .from('otp_sessions')
      .select('count')
      .limit(1);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      supabase: {
        status: error ? 'error' : 'connected',
        error: error?.message
      },
      services: {
        sms: 'available',
        otp: 'available'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// SMS API endpoint - using WorkingOtpService
app.post('/v1/sms/send', async (req, res) => {
  console.log('📱 SMS endpoint called!');
  console.log('📱 Request body:', req.body);
  console.log('📱 Request headers:', req.headers);
  
  try {
    const { phoneNumber, message } = req.body;
    
    console.log(`📱 Received SMS request for ${phoneNumber}`);
    console.log(`📱 Message: ${message}`);
    
    if (!phoneNumber) {
      console.log('❌ Missing phoneNumber');
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }
    
    // Extract OTP from message if it contains one
    const otpMatch = message.match(/\b\d{6}\b/);
    if (otpMatch) {
      const otp = otpMatch[0];
      console.log(`📱 Detected OTP in message: ${otp}`);
      
      // Use WorkingOtpService to send OTP SMS
      const result = await WorkingOtpService.sendOtpSms(phoneNumber, otp);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } else {
      console.log('❌ No OTP found in message');
      res.status(400).json({
        success: false,
        error: 'Message must contain a 6-digit OTP'
      });
    }
    
  } catch (error) {
    console.error('📱 SMS Service Error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to send SMS: ${error.message}`
    });
  }
});



// Certificate management endpoints
app.get('/v1/students', async (req, res) => {
  try {
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .eq('deleted', false);
    
    if (error) {
      return res.status(500).json({ 
        error: 'Failed to fetch students',
        details: error.message 
      });
    }
    
    res.status(200).json({
      status: 'success',
      count: students.length,
      students
    });
    
  } catch (error) {
    console.error('Students fetch error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Initialize services
const certificateGenerator = new CertificateGenerator();

// Generate certificate for a student
app.post('/v1/certificates/generate/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    console.log(`🎓 Certificate generation request for student ID: ${studentId}`);
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required'
      });
    }
    
    const result = await certificateGenerator.generateAndSaveCertificate(parseInt(studentId));
    
    // Certificate generated successfully - stored in database only
    
    res.status(200).json({
      success: true,
      message: 'Certificate generated successfully',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Certificate generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate certificate',
      details: error.message
    });
  }
});

// Download certificate for a student
app.get('/v1/certificates/download/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    console.log(`📥 Certificate download request for student ID: ${studentId}`);
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required'
      });
    }
    
    const certificateData = await certificateGenerator.getCertificate(parseInt(studentId));
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${certificateData.studentName}_Certificate_${certificateData.certificateId}.pdf"`);
    
    // Send the certificate bytes
    res.send(Buffer.from(certificateData.certificate));
    
  } catch (error) {
    console.error('❌ Certificate download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download certificate',
      details: error.message
    });
  }
});

// Get certificate status for a student
app.get('/v1/certificates/status/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required'
      });
    }
    
    const { data: student, error } = await supabase
      .from('students')
      .select('preferred_name, certificate_id, certificate')
      .eq('student_id', parseInt(studentId))
      .single();
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch certificate status',
        details: error.message
      });
    }
    
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }
    
    const hasCertificate = !!student.certificate;
    
    res.status(200).json({
      success: true,
      data: {
        studentName: student.preferred_name,
        certificateId: student.certificate_id,
        hasCertificate,
        generatedAt: null,
        status: hasCertificate ? 'generated' : 'not_generated'
      }
    });
    
  } catch (error) {
    console.error('❌ Certificate status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get certificate status',
      details: error.message
    });
  }
});





// Update student eligibility status
app.put('/v1/students/:studentId/eligibility', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { eligible } = req.body;
    
    console.log(`🎯 Eligibility update request for student ID: ${studentId}, eligible: ${eligible}`);
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'Student ID is required'
      });
    }
    
    if (typeof eligible !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Eligible status must be a boolean value'
      });
    }
    
    // Update Supabase
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update({ eligible })
      .eq('student_id', parseInt(studentId))
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating student eligibility:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update student eligibility',
        details: updateError.message
      });
    }
    
    // Eligibility status updated in database only
    
    res.status(200).json({
      success: true,
      message: 'Student eligibility updated successfully',
      data: {
        studentId: updatedStudent.student_id,
        eligible: updatedStudent.eligible
      }
    });
    
  } catch (error) {
    console.error('❌ Eligibility update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update student eligibility',
      details: error.message
    });
  }
});





// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Certificate Hub Backend Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth API: http://localhost:${PORT}/v1/auth`);
  console.log(`📜 Students API: http://localhost:${PORT}/v1/students`);
  console.log(`📱 SMS API: http://localhost:${PORT}/v1/sms/send`);
  console.log(`🎓 Certificate APIs:`);
  console.log(`   Generate: POST http://localhost:${PORT}/v1/certificates/generate/:studentId`);
  console.log(`   Download: GET http://localhost:${PORT}/v1/certificates/download/:studentId`);
  console.log(`   Status: GET http://localhost:${PORT}/v1/certificates/status/:studentId`);
  console.log(`📊 Database-only operations - Excel functionality removed`);
  console.log(`✅ Certificate Hub Backend ready!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Certificate Hub Backend Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Certificate Hub Backend Server...');
  process.exit(0);
});