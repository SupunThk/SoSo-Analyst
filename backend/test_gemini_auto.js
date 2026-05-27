const axios = require('axios');
require('dotenv').config();
const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

const body = {
  contents: [{ role: 'user', parts: [{ text: 'Why is RENDER pumping?' }] }],
  tools: [{
    functionDeclarations: [{
      name: 'get_token_intelligence',
      description: 'Get a deterministic "why is this moving" intelligence report.',
      parameters: {
        type: 'OBJECT',
        properties: { asset: { type: 'STRING' } },
        required: ['asset']
      }
    }]
  }],
  toolConfig: {
    functionCallingConfig: {
      mode: 'AUTO'
    }
  }
};

axios.post(url, body)
  .then(res => console.log('SUCCESS with AUTO and no allowedFunctionNames'))
  .catch(err => console.error('Error with AUTO:', JSON.stringify(err.response?.data || err.message, null, 2)));
