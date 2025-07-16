import express from 'express';
import supabase from '../supabaseClient.js';

const router = express.Router();

// Submit certificate request endpoint
router.post('/request', async (req, res) => {
  try {
    console.log('📋 Certificate request submission received');
    console.log('📋 Request body:', req.body);

    const {
      phone_number,
      internship_start_date,
      internship_duration,
      course_name,
      company_name,
      preferred_name
    } = req.body;

    // Validate required fields
    if (!phone_number || !internship_start_date || !internship_duration || !course_name || !company_name || !preferred_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'All fields are required for certificate request'
      });
    }

    // Find course_id and company_id based on selected names
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('course_id, course_name')
      .eq('course_name', course_name)
      .single();

    if (courseError || !courses) {
      return res.status(400).json({
        success: false,
        error: 'Invalid course selection',
        message: 'Selected course not found'
      });
    }

    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('company_id, company_name')
      .eq('company_name', company_name)
      .single();

    if (companyError || !companies) {
      return res.status(400).json({
        success: false,
        error: 'Invalid company selection',
        message: 'Selected company not found'
      });
    }

    // Calculate internship end date
    const startDate = new Date(internship_start_date);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parseInt(internship_duration));

    // Check if student exists and if they have already submitted a certificate request
    const { data: existingStudent } = await supabase
      .from('students')
      .select('certificate_id, internship_start_date, preferred_name')
      .eq('phone_number', phone_number)
      .eq('deleted', false)
      .single();

    // Check if student has already submitted a certificate request
    if (existingStudent && (existingStudent.internship_start_date || existingStudent.preferred_name)) {
      return res.status(400).json({
        success: false,
        error: 'Certificate request already submitted',
        message: 'You have already submitted a certificate request. Each student can only request a certificate once.'
      });
    }

    // Generate certificate ID if not exists
    function generateCertificateId() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    const certificateId = existingStudent?.certificate_id || generateCertificateId();

    // Update student record with certificate request data
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update({
        internship_start_date: internship_start_date,
        internship_end_date: endDate.toISOString().split('T')[0],
        internship_duration: parseInt(internship_duration),
        course_id: courses.course_id,
        company_id: companies.company_id,
        preferred_name: preferred_name.trim(),
        certificate_id: certificateId
      })
      .eq('phone_number', phone_number)
      .eq('deleted', false)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating student record:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit certificate request',
        details: updateError.message
      });
    }

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        message: 'No student found with the provided phone number'
      });
    }

    console.log('✅ Certificate request submitted successfully for:', updatedStudent.name);

    // Certificate request data stored in database only

    res.status(200).json({
      success: true,
      message: 'Certificate request submitted successfully',
      data: {
        studentId: updatedStudent.student_id,
        name: updatedStudent.name,
        preferredName: updatedStudent.preferred_name,
        course: course_name,
        company: company_name,
        internshipStartDate: internship_start_date,
        internshipEndDate: endDate.toISOString().split('T')[0],
        requestDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('📋 Certificate request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process certificate request',
      message: error.message
    });
  }
});

// Get certificate request status
router.get('/request-status/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select(`
        student_id,
        name,
        preferred_name,
        internship_start_date,
        internship_end_date,
        eligible,
        courses(course_name),
        companies(company_name)
      `)
      .eq('phone_number', phoneNumber)
      .eq('deleted', false)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch certificate request status',
        details: error.message
      });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const hasSubmittedRequest = !!(student.internship_start_date && student.preferred_name);
    const hasCertificate = false;

    res.status(200).json({
      success: true,
      data: {
        studentId: student.student_id,
        name: student.name,
        preferredName: student.preferred_name,
        course: student.courses?.course_name,
        company: student.companies?.company_name,
        internshipStartDate: student.internship_start_date,
        internshipEndDate: student.internship_end_date,
        requestDate: null,
        hasSubmittedRequest,
        isEligible: student.eligible,
        hasCertificate,
        certificateGeneratedAt: null,
        status: hasCertificate ? 'completed' : hasSubmittedRequest ? 'pending' : 'not_requested'
      }
    });

  } catch (error) {
    console.error('📋 Certificate request status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get certificate request status',
      message: error.message
    });
  }
});

export default router;