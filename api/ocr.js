/**
 * Yandex OCR Backend Proxy
 * 🔑 SECURITY: API key stored as environment variable YANDEX_API_KEY
 * 🛨️ FUNCTION: Accepts base64 image, calls Yandex OCR, returns text
 */

const YANDEX_OCR_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const FOLDER_ID = process.env.YANDEX_FOLDER_ID;

if (!YANDEX_API_KEY || !FOLDER_ID) {
  console.error('⚠️ Missing YANDEX_API_KEY or YANDEX_FOLDER_ID environment variables');
}

async function recognizeText(imageContent, languages = ['ru', 'en']) {
  try {
    console.log('📤 [Backend] Sending to Yandex OCR...');
    
    const requestBody = {
      mimeType: 'image/jpeg',
      languageCodes: languages,
      content: imageContent // Base64 string WITHOUT data URL prefix
    };

    const response = await fetch(YANDEX_OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${YANDEX_API_KEY}`,
        'x-folder-id': FOLDER_ID
      },
      body: JSON.stringify(requestBody),
      timeout: 25000 // 25 sec timeout
    });

    console.log(`📥 [Backend] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Backend] Yandex API Error:', errorText);
      throw new Error(`Yandex API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ [Backend] OCR Response received');

    // Extract text from Yandex response
    let recognizedText = '';
    
    if (data.textAnnotation && data.textAnnotation.text) {
      recognizedText = data.textAnnotation.text;
    } else if (data.blocks) {
      // Extract text from blocks structure
      recognizedText = data.blocks
        .flatMap(block => block.lines || [])
        .flatMap(line => line.words || [])
        .map(word => word.text || '')
        .join(' ');
    }

    console.log('✅ [Backend] Text extracted:', recognizedText.substring(0, 100) + '...');

    return {
      success: true,
      text: recognizedText.trim(),
      confidence: data.textAnnotation?.confidence || null
    };

  } catch (error) {
    console.error('❌ [Backend] OCR Error:', error);
    throw error;
  }
}

// Vercel Serverless Function
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { imageBase64, languages } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    // Remove data URL prefix if present
    let base64Data = imageBase64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const result = await recognizeText(base64Data, languages || ['ru', 'en']);
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ [Backend] Handler Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'OCR processing failed'
    });
  }
}
