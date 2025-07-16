import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_BASE_URL = 'http://localhost:3001';

// Test data for certificate request - using valid course and company names
const testCertificateRequest = {
  phone_number: '8184930950', // Using the phone number from the terminal logs
  internship_start_date: '2025-01-15',
  internship_duration: 3,
  course_name: 'Full Stack', // Using course name instead of ID
  company_name: 'AddWise Tech Innovations', // Using company name instead of ID
  preferred_name: 'Test User Certificate Request'
};

async function testCertificateRequestAPI() {
  console.log('🧪 Testing Certificate Request API...');
  console.log('📋 Test Data:', JSON.stringify(testCertificateRequest, null, 2));
  
  try {
    const response = await fetch(`${API_BASE_URL}/v1/certificates/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCertificateRequest)
    });

    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ Certificate request successful!');
      console.log('🗄️ Check Supabase students table for updated record');
    } else {
      console.log('❌ Certificate request failed:');
      console.log('📊 Error details:', result);
    }
  } catch (error) {
    console.error('🚨 Network error:', error.message);
  }
}

async function testHealthCheck() {
  console.log('🏥 Testing Health Check...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Server is healthy!');
      console.log('📊 Health Status:', result.status);
    } else {
      console.log('❌ Server health check failed:');
      console.log('📊 Error:', result);
    }
  } catch (error) {
    console.error('🚨 Health check failed:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Certificate Request Tests...');
  console.log('=' .repeat(60));
  
  // Test 1: Health Check
  await testHealthCheck();
  console.log('\n' + '-'.repeat(40) + '\n');
  
  // Test 2: Certificate Request (database-only storage)
  await testCertificateRequestAPI();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Tests completed!');
  console.log('\n📝 What to check:');
  console.log('1. ✅ Verify that the internship_duration field is populated');
  console.log('2. ✅ Check Supabase students table for updated record');
  console.log('3. ✅ Check the backend console logs for any errors');
  console.log('4. ✅ Confirm data is stored in database only (no Excel files)');
  console.log('\n⚠️  Note: Make sure the server is running on port 3001');
}

// Run the tests
runTests().catch(console.error);