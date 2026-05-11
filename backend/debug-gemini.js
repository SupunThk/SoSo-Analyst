const axios = require('axios');
require('dotenv').config({ override: true });

async function debugGemini() {
  console.log('--- GEMINI API DEBUG START ---');
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY found in .env');
    return;
  }

  console.log('API Key (masked):', apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 4));
  
  const modelsToTest = ['gemini-2.5-flash'];

  for (const modelName of modelsToTest) {
    console.log(`\nTesting model: ${modelName}...`);
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          contents: [
            {
              parts: [{ text: 'Hi' }]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ ${modelName}: SUCCESS`);
      console.log('Response:', response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text response');
    } catch (error) {
      console.error(`❌ ${modelName}: FAILED`);
      console.error('Error Code:', error.code || 'N/A');
      console.error('Error Message:', error.response?.data?.error?.message || error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data));
      }
    }
  }

  console.log('\n--- GEMINI API DEBUG COMPLETE ---');
}

debugGemini();
