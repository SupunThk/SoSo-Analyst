const axios = require('axios');
require('dotenv').config({ override: true });

async function testAPIs() {
  console.log('--- STARTING API VERIFICATION ---');

  // 1. Test SoSoValue
  console.log('\n1. Testing SoSoValue API...');
  if (!process.env.SOSO_API_KEY) {
    console.error('❌ SOSO_API_KEY is missing in .env');
  } else {
    try {
      const sosoRes = await axios.get('https://openapi.sosovalue.com/openapi/v1/currencies', {
        headers: { 'x-soso-api-key': process.env.SOSO_API_KEY },
        params: { pageSize: 1 }
      });
      console.log('✅ SoSoValue API: SUCCESS');
      console.log('Sample Data:', JSON.stringify(sosoRes.data).substring(0, 100) + '...');
    } catch (error) {
      console.error('❌ SoSoValue API: FAILED');
      console.error('Error:', error.response ? error.response.data : error.message);
    }
  }

  // 2. Test Gemini
  console.log('\n2. Testing Gemini API (gemini-2.5-flash)...');
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is missing in .env');
  } else {
    try {
      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          contents: [
            {
              parts: [
                {
                  text: 'Hello, are you working? Respond with "YES" if you are.'
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Gemini API: SUCCESS');
      console.log('Response:', result.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text response');
    } catch (error) {
      console.error('❌ Gemini API: FAILED');
      console.error('Error:', error.response?.data?.error?.message || error.message);
    }
  }

  console.log('\n--- VERIFICATION COMPLETE ---');
}

testAPIs();
