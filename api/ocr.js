/**
 * 🔐 Yandex OCR Backend Proxy
 * - Receives image (base64 or URL-encoded)
 * - Calls Yandex Cloud OCR API
 * - Returns extracted text or error
 * - API KEY stored in env variables (never exposed to frontend)
 */

const YANDEX_OCR_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';

async function callYandexOCR(base64Content, languages) {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    throw new Error('⚠️ Backend Configuration Error: Missing YANDEX_API_KEY or YANDEX_FOLDER_ID');
  }

  try {
    console.log('[Backend] 📤 Calling Yandex OCR API...');

    const payload = {
      mimeType: 'image/jpeg',
      languageCodes: Array.isArray(languages) ? languages : ['ru', 'en'],
      content: base64Content
    };

    const response = await fetch(YANDEX_OCR_URL, {
      method: 'POST',
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${apiKey}`,
        'x-folder-id': folderId
      },
      body: JSON.stringify(payload)
    });

    console.log(`[Backend] 📥 Yandex responded: ${response.status}`);

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        errorMsg = errorBody.message || errorBody.error || errorMsg;
      } catch (e) {
        const textErr = await response.text();
        if (textErr.includes('Unauthorized')) errorMsg = 'Invalid API Key';
        if (textErr.includes('Forbidden')) errorMsg = 'Invalid Folder ID';
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    console.log('[Backend] ✅ OCR Result received');

    // Parse Yandex response
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

    return {
      success: true,
      text: extractedText.trim(),
      confidence: result.textAnnotation?.confidence || 0.9
    };
  } catch (err) {
    console.error('[Backend] ❌ Yandex OCR Error:', err.message);
    throw err;
  }
}

// Vercel Serverless Handler
export default async function handler(req, res) {
  // 🔓 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Only POST method allowed'
    });
  }

  try {
    const { imageBase64, languages } = req.body;

    // Validate input
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid imageBase64'
      });
    }

    console.log('[Backend] 📨 Request received');
    console.log(`[Backend] 📏 Image size: ${Math.round(imageBase64.length / 1024)}KB`);

    // Extract base64 from data URL if needed
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

    // Call Yandex OCR
    const ocrResult = await callYandexOCR(base64Data, languages);

    console.log('[Backend] ✅ Sending response to frontend');
    return res.status(200).json(ocrResult);

  } catch (error) {
    console.error('[Backend] ❌ Handler error:', error.message);

    // Distinguish between setup errors and API errors
    const statusCode = error.message.includes('Configuration') ? 500 : 500;
    const errorMsg = error.message.includes('Configuration')
      ? '⚙️ Backend не настроен. Установи YANDEX_API_KEY и YANDEX_FOLDER_ID в Vercel'
      : error.message;

    return res.status(statusCode).json({
      success: false,
      error: errorMsg
    });
  }
}
