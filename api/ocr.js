/**
 * 🔐 Yandex OCR Backend Proxy v2
 * - Enhanced debugging
 * - Better error messages
 * - Fixed deployment issues
 */

const YANDEX_OCR_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';

async function callYandexOCR(base64Content, languages) {
  const apiKey = process.env.YANDEX_API_KEY?.trim();
  const folderId = process.env.YANDEX_FOLDER_ID?.trim();

  console.log('[Backend] 🔍 Checking credentials...');
  console.log('[Backend] API Key exists:', !!apiKey);
  console.log('[Backend] Folder ID exists:', !!folderId);

  if (!apiKey) {
    console.error('[Backend] ❌ YANDEX_API_KEY not set');
    throw new Error('Missing YANDEX_API_KEY');
  }
  if (!folderId) {
    console.error('[Backend] ❌ YANDEX_FOLDER_ID not set');
    throw new Error('Missing YANDEX_FOLDER_ID');
  }

  try {
    console.log('[Backend] 📤 Calling Yandex OCR...');
    console.log('[Backend] URL:', YANDEX_OCR_URL);
    console.log('[Backend] Languages:', languages);

    const payload = {
      mimeType: 'image/jpeg',
      languageCodes: Array.isArray(languages) ? languages : ['ru', 'en'],
      content: base64Content.substring(0, 100) + '...' // Log preview
    };

    const response = await fetch(YANDEX_OCR_URL, {
      method: 'POST',
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${apiKey}`,
        'x-folder-id': folderId
      },
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        languageCodes: Array.isArray(languages) ? languages : ['ru', 'en'],
        content: base64Content
      })
    });

    console.log(`[Backend] 📥 Yandex response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      let errorBody = null;
      
      try {
        errorBody = await response.json();
        errorMsg = errorBody.message || errorBody.error || errorMsg;
      } catch (e) {
        try {
          const textErr = await response.text();
          if (textErr.includes('Unauthorized')) errorMsg = 'API Key Invalid (401)';
          else if (textErr.includes('Forbidden')) errorMsg = 'Folder ID Invalid (403)';
          else errorMsg = `Error: ${response.status}`;
        } catch (e2) {}
      }
      
      console.error('[Backend] ❌ Yandex Error:', errorMsg);
      throw new Error(errorMsg);
    }

    const result = await response.json();
    console.log('[Backend] ✅ OCR Success, parsing...');

    let extractedText = '';

    if (result.textAnnotation?.text) {
      extractedText = result.textAnnotation.text;
    } else if (result.blocks) {
      extractedText = result.blocks
        .flatMap(b => b.lines || [])
        .flatMap(l => l.words || [])
        .map(w => w.text)
        .filter(Boolean)
        .join(' ');
    }

    console.log('[Backend] ✅ Text extracted, length:', extractedText.length);

    return {
      success: true,
      text: extractedText.trim() || 'No text detected',
      confidence: result.textAnnotation?.confidence || 0.9
    };
  } catch (err) {
    console.error('[Backend] ❌ Error:', err.message);
    throw err;
  }
}

// Vercel Serverless Handler
export default async function handler(req, res) {
  console.log(`[Backend] 📨 ${req.method} ${req.url}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Preflight
  if (req.method === 'OPTIONS') {
    console.log('[Backend] ✅ Preflight OK');
    return res.status(200).end();
  }

  // Only POST
  if (req.method !== 'POST') {
    console.log('[Backend] ❌ Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed. Use POST.`
    });
  }

  try {
    const { imageBase64, languages } = req.body || {};

    console.log('[Backend] 📋 Body received, imageBase64 exists:', !!imageBase64);

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      console.log('[Backend] ❌ Invalid imageBase64');
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid imageBase64 in request body'
      });
    }

    console.log(`[Backend] 📏 Image size: ${Math.round(imageBase64.length / 1024)}KB`);

    // Extract base64
    let base64Data = imageBase64;
    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/,(.+)$/);
      if (!match) {
        return res.status(400).json({
          success: false,
          error: 'Invalid data URL format'
        });
      }
      base64Data = match[1];
    }

    // Call Yandex
    const ocrResult = await callYandexOCR(base64Data, languages);

    console.log('[Backend] ✅ Returning result to frontend');
    return res.status(200).json(ocrResult);

  } catch (error) {
    console.error('[Backend] 💥 HANDLER ERROR:', error);
    console.error('[Backend] Stack:', error.stack);

    let statusCode = 500;
    let errorMsg = error.message || 'Unknown error';

    if (errorMsg.includes('Missing')) {
      statusCode = 500;
      errorMsg = '⚙️ Backend Configuration Error: ' + errorMsg;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMsg,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
