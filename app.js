(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const fileInput = $('#fileInput');
  const imgPreview = $('#imgPreview');
  const imgPlaceholder = $('#imgPlaceholder');
  const btnOcr = $('#btnOcr');
  const btnYandexOcr = $('#btnGeminiOcr'); // Repurposed button
  const btnUseSample = $('#btnUseSample');
  const ocrLang = $('#ocrLang');
  const ocrStatus = $('#ocrStatus');
  const ocrBar = $('#ocrBar');
  const textInput = $('#textInput');
  const btnAnalyze = $('#btnAnalyze');
  const btnClear = $('#btnClear');
  const results = $('#results');
  const ecodesTable = $('#ecodesTable');
  const allergensBlock = $('#allergensBlock');
  const compositionSnippet = $('#compositionSnippet');
  const nutrSugar = $('#nutrSugar');
  const nutrFat = $('#nutrFat');
  const nutrSalt = $('#nutrSalt');
  const btnRecalc = $('#btnRecalc');
  const tlSugar = $('#tlSugar');
  const tlFat = $('#tlFat');
  const tlSalt = $('#tlSalt');
  const overallVerdict = $('#overallVerdict');
  const overallTitle = $('#overallTitle');
  const overallBody = $('#overallBody');
  const metricEcodes = $('#metricEcodes');
  const metricAllergens = $('#metricAllergens');
  const metricSugars = $('#metricSugars');
  const btnGeneratePDF = $('#btnGeneratePDF');
  const btnSaveToHistory = $('#btnSaveToHistory');
  const btnCompare = $('#btnCompare');
  const historyBlock = $('#historyBlock');
  const aboutDialog = $('#aboutDialog');
  const btnOpenAbout = $('#btnOpenAbout');
  const githubLink = $('#githubLink');

  githubLink.href = 'https://github.com/' + (window.__LABELSPY_REPO || '');

  // 🌐 YANDEX OCR BACKEND ENDPOINT (NO API KEY EXPOSED)
  const YANDEX_OCR_ENDPOINT = '/api/ocr';

  let eDb = {};
  let lastAnalysis = null;
  let lastImageDataUrl = null;
  const HISTORY_KEY = 'labelspy_v3_history';
  const COMPARE_KEY = 'labelspy_v3_compare';

  async function loadDb() {
    try {
      const res = await fetch('./data/e_additives_ru.json', { cache: 'no-cache' });
      eDb = await res.json();
      console.log('✅ Database loaded:', Object.keys(eDb).length, 'E-codes');
    } catch (e) {
      console.error('❌ DB load error:', e);
      eDb = {};
    }
  }

  function setOcrProgress(progress01, status) {
    const p = Math.max(0, Math.min(1, progress01));
    ocrBar.style.width = Math.round(p * 100) + '%';
    if (status) ocrStatus.textContent = status;
  }

  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // 🌐 YANDEX OCR - Via Backend Proxy (Secure)
  async function recognizeWithYandex(imageDataUrl) {
    try {
      console.log('🌐 [Frontend] Starting Yandex OCR...');
      
      const base64Data = imageDataUrl.split(',')[1];
      const languages = (ocrLang.value || 'rus+eng').split('+').map(l => l.startsWith('rus') ? 'ru' : 'en');

      console.log(`📸 [Frontend] Image size: ${base64Data.length}, Languages: ${languages}`);

      const requestBody = {
        imageBase64: imageDataUrl, // Full data URL
        languages: languages
      };

      console.log('📤 [Frontend] Sending to backend...');
      
      const response = await fetch(YANDEX_OCR_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`📥 [Frontend] Response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [Frontend] Backend Error:', errorData);
        throw new Error(`Backend Error: ${response.status} - ${errorData.error}`);
      }

      const data = await response.json();
      console.log('✅ [Frontend] OCR Result:', data);

      if (!data.success) {
        throw new Error(data.error || 'OCR failed');
      }

      return data.text;
    } catch (error) {
      console.error('❌ [Frontend] Yandex OCR error:', error);
      throw error;
    }
  }

  // 🎨 Image Preprocessing
  async function preprocessImage(imageDataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width * 4;
        canvas.height = img.height * 4;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        
        let histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          histogram[Math.round(gray)]++;
        }
        
        let sum = 0, sumB = 0, wB = 0, wF = 0, mB, mF, max = 0, between, threshold = 128;
        for (let t = 0; t < 256; t++) {
          wB += histogram[t];
          if (wB === 0) continue;
          wF = data.length / 4 - wB;
          if (wF === 0) break;
          sumB += t * histogram[t];
          mB = sumB / wB;
          mF = (sum - sumB) / wF;
          between = wB * wF * Math.pow((mB - mF), 2);
          if (between > max) { max = between; threshold = t; }
        }
        
        let minGray = 255, maxGray = 0;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          minGray = Math.min(minGray, gray);
          maxGray = Math.max(maxGray, gray);
        }
        const range = maxGray - minGray || 1;
        
        for (let i = 0; i < data.length; i += 4) {
          let gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          gray = ((gray - minGray) / range) * 255;
          gray = Math.pow(gray / 255, 0.75) * 255;
          const bw = gray > threshold ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = bw;
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.src = imageDataUrl;
    });
  }

  function cleanOCRText(rawText) {
    return rawText
      .replace(/([\u0430-\u044f\u0451])\u041e([\u0430-\u044f\u0451])/g, '$1\u043e$2')
      .replace(/([0-9])\u041e(?=[^0-9])/g, '$10')
      .replace(/\u041e([0-9])/g, '0$1')
      .replace(/\u0417/g, '3').replace(/\u0437/g, '3')
      .replace(/l/g, '1')
      .replace(/\u0401/g, '\u0415').replace(/\u0451/g, '\u0435')
      .replace(/[^\w\s\u0401\u0451\u0410-\u042f\u0430-\u044f()\-.,+\u00d7\u00f7=%\n]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/([\u0415E])\s+([0-9])/g, 'E$2')
      .replace(/([\u0415E])-([0-9])/g, 'E$2')
      .replace(/([\u0415E])\u2013([0-9])/g, 'E$2')
      .replace(/E([0-9]{3,4})\s+([a-z])/g, 'E$1$2')
      .replace(/\s+,/g, ',')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/(\d),\s*(\d)/g, '$1.$2')
      .trim();
  }

  function normalizeEcode(raw) {
    if (!raw) return null;
    let x = raw.toUpperCase().replace(/[\u0415E]/g, 'E').replace(/[\u041eO0]/g, '0');
    x = x.replace(/\s+/g, '');
    const m = x.match(/^E-?(\d{3,4})([A-Z])?$/);
    if (!m) return null;
    return 'E' + m[1] + (m[2] ? m[2].toLowerCase() : '');
  }

  function extractEcodes(text) {
    const t = (text || '').toUpperCase().replace(/[\u0415E]/g, 'E').replace(/[\u041eO0]/g, '0');
    const re = /\bE\s*[-\u2013]?\s*(\d{3,4})([A-Z])?\b/g;
    const found = new Set();
    let m;
    while ((m = re.exec(t)) !== null) {
      const code = normalizeEcode('E' + m[1] + (m[2] || ''));
      if (code) found.add(code);
    }
    return Array.from(found).sort();
  }

  function extractCompositionBlock(rawText) {
    const text = (rawText || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const lower = text.toLowerCase();
    const markers = ['\u0441\u043e\u0441\u0442\u0430\u0432:', '\u0441\u043e\u0441\u0442\u0430\u0432 -', '\u0438\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b:'];
    let start = -1;
    for (const m of markers) {
      const idx = lower.indexOf(m);
      if (idx !== -1) { start = idx + m.length; break; }
    }
    let cut = (start !== -1) ? text.slice(start) : text;
    const stopMarkers = ['\u043f\u0438\u0449\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u044c', '\u044d\u043d\u0435\u0440\u0433\u0435\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u044c', '\u043d\u0430 100'];
    let stopPos = cut.length;
    const cutLower = cut.toLowerCase();
    for (const s of stopMarkers) {
      const idx = cutLower.indexOf(s);
      if (idx !== -1 && idx < stopPos) stopPos = idx;
    }
    return cut.slice(0, stopPos).trim();
  }

  function autoExtractNutrients(text) {
    const t = (text || '').toLowerCase().replace(/,/g, '.');
    const read = (labels) => {
      for (const lbl of labels) {
        const re = new RegExp(lbl + String.raw`\s*[:\-\u2013]?\s*(\d+(?:\.\d+)?)\s*\u0433`, 'i');
        const m = t.match(re);
        if (m && m[1]) return parseFloat(m[1]);
      }
      return null;
    };
    return {
      sugar: read(['\u0441\u0430\u0445\u0430\u0440\u0430', '\u0441\u0430\u0445\u0430\u0440']),
      fat: read(['\u0436\u0438\u0440\u044b', '\u0436\u0438\u0440']),
      salt: read(['\u0441\u043e\u043b\u044c', '\u043d\u0430\u0442\u0440\u0438\u0439'])
    };
  }

  const allergens = [
    { key: 'milk', label: '\u041c\u043e\u043b\u043e\u043a\u043e', patterns: ['\u043c\u043e\u043b\u043e\u043a', '\u043b\u0430\u043a\u0442\u043e\u0437', '\u0441\u044b\u0432\u043e\u0440\u043e\u0442\u043e\u043a', '\u043a\u0430\u0437\u0435\u0438\u043d', '\u0441\u043b\u0438\u0432\u043a'] },
    { key: 'gluten', label: '\u0413\u043b\u044e\u0442\u0435\u043d', patterns: ['\u0433\u043b\u044e\u0442\u0435\u043d', '\u043f\u0448\u0435\u043d\u0438\u0446', '\u0440\u043e\u0436', '\u044f\u0447\u043c\u0435\u043d', '\u043e\u0432\u0451\u0441', '\u043c\u0443\u043a\u0430'] },
    { key: 'soy', label: '\u0421\u043e\u044f', patterns: ['\u0441\u043e\u044f', '\u0441\u043e\u0435\u0432'] },
    { key: 'eggs', label: '\u042f\u0439\u0446\u0430', patterns: ['\u044f\u0438\u0446', '\u0430\u043b\u044c\u0431\u0443\u043c\u0438\u043d'] },
    { key: 'nuts', label: '\u041e\u0440\u0435\u0445\u0438', patterns: ['\u043e\u0440\u0435\u0445', '\u043c\u0438\u043d\u0434\u0430\u043b', '\u0444\u0443\u043d\u0434\u0443\u043a', '\u0430\u0440\u0430\u0445\u0438\u0441'] },
    { key: 'fish', label: '\u0420\u044b\u0431\u0430', patterns: ['\u0440\u044b\u0431', '\u043b\u043e\u0441\u043e\u0441', '\u0442\u0443\u043d\u0435\u0446'] }
  ];

  const hiddenSugars = ['\u0433\u043b\u044e\u043a\u043e\u0437\u043d\u044b\u0439 \u0441\u0438\u0440\u043e\u043f', '\u0444\u0440\u0443\u043a\u0442\u043e\u0437\u043d\u044b\u0439 \u0441\u0438\u0440\u043e\u043f', '\u0438\u043d\u0432\u0435\u0440\u0442\u043d\u044b\u0439 \u0441\u0438\u0440\u043e\u043f', '\u043f\u0430\u0442\u043e\u043a\u0430', '\u043c\u0430\u043b\u044c\u0442\u043e\u0434\u0435\u043a\u0441\u0442\u0440\u0438\u043d', '\u0434\u0435\u043a\u0441\u0442\u0440\u043e\u0437\u0430', '\u0441\u0438\u0440\u043e\u043f', '\u043c\u0451\u0434', '\u0441\u0430\u0445\u0430\u0440\u043e\u0437\u0430', '\u0444\u0440\u0443\u043a\u0442\u043e\u0437\u0430', '\u0433\u043b\u044e\u043a\u043e\u0437\u0430'];

  function detectAllergens(text) {
    const t = (text || '').toLowerCase();
    const found = [];
    for (const a of allergens) {
      for (const p of a.patterns) {
        if (t.includes(p)) {
          found.push(a.label);
          break;
        }
      }
    }
    return found;
  }

  function detectHiddenSugars(text) {
    const t = (text || '').toLowerCase();
    const found = [];
    for (const s of hiddenSugars) {
      if (t.includes(s)) found.push(s);
    }
    return Array.from(new Set(found));
  }

  const THRESHOLDS = {
    sugar: { lowMax: 5.0, highMin: 22.5, unit: '\u0433/100\u0433' },
    fat: { lowMax: 3.0, highMin: 17.5, unit: '\u0433/100\u0433' },
    salt: { lowMax: 0.3, highMin: 1.75, unit: '\u0433/100\u0433' }
  };

  function classifyTraffic(value, th) {
    if (value == null || !Number.isFinite(value)) return { level: 'unknown', label: '\u2014' };
    if (value <= th.lowMax) return { level: 'green', label: `\u043d\u0438\u0437\u043a. (${value} ${th.unit})` };
    if (value > th.highMin) return { level: 'red', label: `\u0432\u044b\u0441\u043e\u043a. (${value} ${th.unit})` };
    return { level: 'yellow', label: `\u0441\u0440\u0435\u0434\u043d. (${value} ${th.unit})` };
  }

  function setPill(el, cls, text) {
    el.className = 'pill pill-' + cls;
    el.textContent = text;
  }

  function computeOverallVerdict(eItems, allergenList, sugarHints, tl) {
    let score = 100;
    const byAttention = { \u043d\u0438\u0437\u043a\u0438\u0439: 1, \u0441\u0440\u0435\u0434\u043d\u0438\u0439: 2, \u0432\u044b\u0441\u043e\u043a\u0438\u0439: 3 };
    for (const it of eItems) {
      score -= (byAttention[it.attention || '\u0441\u0440\u0435\u0434\u043d\u0438\u0439'] || 2) * 5;
    }
    score -= Math.min(20, allergenList.length * 6);
    score -= Math.min(15, sugarHints.length * 5);
    const penalty = (lvl) => lvl === 'red' ? 25 : (lvl === 'yellow' ? 10 : 0);
    score -= penalty(tl.sugar.level) + penalty(tl.fat.level) + penalty(tl.salt.level);
    score = Math.max(0, Math.min(100, score));
    if (score >= 75) return { color: 'green', title: '\u2705 \u0417\u0435\u043b\u0451\u043d\u0430\u044f \u0437\u043e\u043d\u0430', body: '\u0414\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043d\u0435\u0439\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0441\u043e\u0441\u0442\u0430\u0432, \u043c\u0430\u043b\u043e "\u043a\u0440\u0430\u0441\u043d\u044b\u0445" \u0441\u0438\u0433\u043d\u0430\u043b\u043e\u0432.' };
    if (score >= 45) return { color: 'yellow', title: '\u26a0\ufe0f \u0416\u0451\u043b\u0442\u0430\u044f \u0437\u043e\u043d\u0430', body: '\u0415\u0441\u0442\u044c \u0444\u0430\u043a\u0442\u043e\u0440\u044b \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f. \u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u0442\u0441\u044f \u0443\u043c\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c.' };
    return { color: 'red', title: '\ud83d\udeab \u041a\u0440\u0430\u0441\u043d\u0430\u044f \u0437\u043e\u043d\u0430', body: '\u041c\u043d\u043e\u0433\u043e \u0444\u0430\u043a\u0442\u043e\u0440\u043e\u0432 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f. \u0414\u043b\u044f \u0440\u0435\u0433\u0443\u043b\u044f\u0440\u043d\u043e\u0433\u043e \u0443\u043f\u043e\u0442\u0440\u0435\u0431\u043b\u0435\u043d\u0438\u044f \u043b\u0443\u0447\u0448\u0435 \u0441\u0440\u0430\u0432\u043d\u0438\u0442\u044c \u0441 \u0430\u043b\u044c\u0442\u0435\u0440\u043d\u0430\u0442\u0438\u0432\u0430\u043c\u0438.' };
  }

  function setVerdict(v) {
    overallVerdict.classList.remove('verdict-green', 'verdict-yellow', 'verdict-red');
    overallVerdict.classList.add('verdict-' + v.color);
    overallTitle.textContent = v.title;
    overallBody.textContent = v.body;
  }

  function saveToComparison() {
    if (!lastAnalysis) return;
    let compare = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
    const item = { ...lastAnalysis, timestamp: Date.now(), id: Date.now() };
    compare.push(item);
    if (compare.length > 5) compare = compare.slice(-5);
    localStorage.setItem(COMPARE_KEY, JSON.stringify(compare));
    alert('\u2705 \u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0432 \u0441\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435!');
  }

  function loadHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const historyContent = $('#historyContent');
    if (history.length === 0) {
      historyBlock.classList.add('hidden');
      return;
    }
    historyBlock.classList.remove('hidden');
    historyContent.innerHTML = history.slice(0, 5).map((item, idx) => `
      <div class="history-item">
        <div class="history-header">
          <strong>\ud83d\udcca \u0410\u043d\u0430\u043b\u0438\u0437 #${history.length - idx}</strong>
          <span class="muted small">${new Date(item.timestamp).toLocaleDateString('ru')}</span>
        </div>
        <div class="history-body">
          <span class="pill pill-${item.verdict?.color || 'unknown'}">${item.verdict?.title || '\u041d/\u0414'}</span>
          <span class="muted small">E-\u043a\u043e\u0434\u044b: ${item.ecodes?.length || 0}, \u0410\u043b\u043b\u0435\u0440\u0433\u0435\u043d\u044b: ${item.allergens?.length || 0}</span>
        </div>
      </div>
    `).join('');
  }

  async function generatePDFReport() {
    if (!lastAnalysis || typeof jspdf === 'undefined') {
      alert('\u26a0\ufe0f \u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0434\u043b\u044f \u043e\u0442\u0447\u0435\u0442\u0430');
      return;
    }
    
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LabelSpy - \u0410\u043d\u0430\u043b\u0438\u0437 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430', 20, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`\u0414\u0430\u0442\u0430: ${new Date().toLocaleDateString('ru')}`, 20, 30);
      
      let y = 45;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('\u041e\u0431\u0449\u0430\u044f \u043e\u0446\u0435\u043d\u043a\u0430', 20, y);
      y += 8;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const verdictText = `${lastAnalysis.verdict.title}: ${lastAnalysis.verdict.body}`;
      const splitVerdict = doc.splitTextToSize(verdictText, 170);
      doc.text(splitVerdict, 20, y);
      y += splitVerdict.length * 6 + 10;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('E-\u043a\u043e\u0434\u044b', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (lastAnalysis.ecodes && lastAnalysis.ecodes.length > 0) {
        doc.text(lastAnalysis.ecodes.join(', '), 20, y);
        y += 8;
      } else {
        doc.text('\u041d\u0435 \u043e\u0431\u043d\u0430\u0440\u0443\u0436\u0435\u043d\u043e', 20, y);
        y += 8;
      }
      
      y += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('\u0410\u043b\u043b\u0435\u0440\u0433\u0435\u043d\u044b', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (lastAnalysis.allergens && lastAnalysis.allergens.length > 0) {
        doc.text(lastAnalysis.allergens.join(', '), 20, y);
        y += 8;
      } else {
        doc.text('\u041d\u0435 \u043e\u0431\u043d\u0430\u0440\u0443\u0436\u0435\u043d\u043e', 20, y);
        y += 8;
      }
      
      doc.save(`labelspy-report-${Date.now()}.pdf`);
      alert('\u2705 PDF \u043e\u0442\u0447\u0435\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d!');
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 PDF');
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log('\ud83d\udcc1 File selected:', file.name, file.size, 'bytes');
    lastImageDataUrl = await toDataUrl(file);
    imgPreview.src = lastImageDataUrl;
    imgPreview.style.display = 'block';
    imgPlaceholder.style.display = 'none';
    btnOcr.disabled = false;
    if (btnYandexOcr) btnYandexOcr.disabled = false;
  });

  btnOcr.addEventListener('click', async () => {
    if (!lastImageDataUrl) return;
    btnOcr.disabled = true;
    ocrStatus.classList.remove('hidden');
    try {
      setOcrProgress(0.1, '\ud83d\uddbc\ufe0f \u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f...');
      const processed = await preprocessImage(lastImageDataUrl);
      
      setOcrProgress(0.3, '\ud83d\udd0d \u0420\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0432\u0430\u043d\u0438\u0435 Tesseract...');
      const { data: { text } } = await Tesseract.recognize(processed, ocrLang.value || 'rus+eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(0.3 + m.progress * 0.6, `\ud83d\udd0d ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      setOcrProgress(0.95, '\u2728 \u041e\u0447\u0438\u0441\u0442\u043a\u0430...');
      textInput.value = cleanOCRText(text);
      
      setOcrProgress(1, '\u2705 \u0413\u043e\u0442\u043e\u0432\u043e!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 800);
    } catch (e) {
      console.error('Tesseract Error:', e);
      ocrStatus.classList.add('hidden');
      alert('\u274c \u041e\u0448\u0438\u0431\u043a\u0430 Tesseract: ' + e.message);
    }
    btnOcr.disabled = false;
  });

  // 🌐 YANDEX OCR Via Backend
  if (btnYandexOcr) {
    btnYandexOcr.addEventListener('click', async () => {
      if (!lastImageDataUrl) return;
      btnYandexOcr.disabled = true;
      ocrStatus.classList.remove('hidden');
      try {
        setOcrProgress(0.1, '\ud83c\udf10 \u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0432 \u0431\u044d\u043a\u0435\u043d\u0434...');
        setOcrProgress(0.2, '\ud83c\udf10 \u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u0432 Yandex OCR...');
        const text = await recognizeWithYandex(lastImageDataUrl);
        
        setOcrProgress(0.9, '\u2728 \u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0430...');
        textInput.value = cleanOCRText(text);
        
        setOcrProgress(1, '\u2705 Yandex OCR - \u0443\u0441\u043f\u0435\u0448\u043d\u043e!');
        setTimeout(() => ocrStatus.classList.add('hidden'), 1000);
      } catch (e) {
        console.error('Yandex Error:', e);
        ocrStatus.classList.add('hidden');
        alert(`\u274c Yandex OCR:\n${e.message}\n\n\ud83d\udca1 \u041e\u0442\u043a\u0440\u043e\u0439 Console (F12) \u0434\u043b\u044f \u0434\u0435\u0442\u0430\u043b\u0435\u0439`);
      }
      btnYandexOcr.disabled = false;
    });
  }

  btnUseSample.addEventListener('click', () => {
    textInput.value = '\u0421\u043e\u0441\u0442\u0430\u0432: \u0432\u043e\u0434\u0430, \u043f\u0448\u0435\u043d\u0438\u0447\u043d\u0430\u044f \u043c\u0443\u043a\u0430, \u0441\u0430\u0445\u0430\u0440, \u043c\u0430\u0441\u043b\u043e \u0441\u043b\u0438\u0432\u043e\u0447\u043d\u043e\u0435, \u044f\u0439\u0446\u0430, \u043c\u043e\u043b\u043e\u043a\u043e, \u0441\u043e\u043b\u044c, E621, E330, \u0440\u0430\u0437\u0440\u044b\u0445\u043b\u0438\u0442\u0435\u043b\u044c (E500ii). \u041f\u0438\u0449\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u043d\u0430 100\u0433: \u0441\u0430\u0445\u0430\u0440 15\u0433, \u0436\u0438\u0440\u044b 8\u0433, \u0441\u043e\u043b\u044c 0.5\u0433.';
  });

  btnAnalyze.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      alert('\u26a0\ufe0f \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043b\u0438 \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0439\u0442\u0435 \u0441\u043e\u0441\u0442\u0430\u0432!');
      return;
    }

    const ecodes = extractEcodes(text);
    const compositionBlock = extractCompositionBlock(text);
    const allergens_found = detectAllergens(text);
    const hidden_sugars = detectHiddenSugars(text);
    const nutrients = autoExtractNutrients(text);

    nutrSugar.value = nutrients.sugar || '';
    nutrFat.value = nutrients.fat || '';
    nutrSalt.value = nutrients.salt || '';

    const tl_sugar = classifyTraffic(parseFloat(nutrSugar.value), THRESHOLDS.sugar);
    const tl_fat = classifyTraffic(parseFloat(nutrFat.value), THRESHOLDS.fat);
    const tl_salt = classifyTraffic(parseFloat(nutrSalt.value), THRESHOLDS.salt);

    setPill(tlSugar, tl_sugar.level, tl_sugar.label);
    setPill(tlFat, tl_fat.level, tl_fat.label);
    setPill(tlSalt, tl_salt.level, tl_salt.label);

    const eItems = ecodes.map(code => eDb[code] || { name_ru: code, attention: '\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e' });
    const verdict = computeOverallVerdict(eItems, allergens_found, hidden_sugars, { sugar: tl_sugar, fat: tl_fat, salt: tl_salt });
    setVerdict(verdict);

    lastAnalysis = { ecodes, allergens: allergens_found, sugars: hidden_sugars, nutrients, composition: compositionBlock, verdict, timestamp: Date.now() };

    metricEcodes.textContent = ecodes.length;
    metricAllergens.textContent = allergens_found.length;
    metricSugars.textContent = hidden_sugars.length;
    compositionSnippet.textContent = compositionBlock || '\u2014';

    if (allergens_found.length > 0) {
      allergensBlock.classList.remove('hidden');
      $('#allergensContent').innerHTML = allergens_found.map(a => `<span class="pill pill-high">${a}</span>`).join('');
    } else {
      allergensBlock.classList.add('hidden');
    }

    if (hidden_sugars.length > 0) {
      $('#sugarsBlock').classList.remove('hidden');
      $('#sugarsContent').innerHTML = hidden_sugars.map(s => `<span class="pill pill-yellow">${s}</span>`).join('');
    } else {
      $('#sugarsBlock').classList.add('hidden');
    }

    if (ecodes.length > 0) {
      ecodesTable.classList.remove('hidden');
      const rows = ecodes.map(code => {
        const item = eDb[code] || {};
        const name = item.name_ru || code;
        const attention = item.attention || '\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e';
        const notes = item.notes_ru || '\u2014';
        const cls = attention === '\u0432\u044b\u0441\u043e\u043a\u0438\u0439' ? 'badge-high' : (attention === '\u0441\u0440\u0435\u0434\u043d\u0438\u0439' ? 'badge-mid' : 'badge-low');
        return `<tr><td class="mono">${code}</td><td>${name}</td><td><span class="badge ${cls}">${attention}</span></td><td>${notes}</td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>\u041a\u043e\u0434</th><th>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</th><th>\u041e\u0446\u0435\u043d\u043a\u0430</th><th>\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      ecodesTable.classList.add('hidden');
    }

    results.classList.remove('hidden');
    loadHistory();
  });

  btnClear.addEventListener('click', () => {
    textInput.value = '';
    fileInput.value = '';
    imgPreview.style.display = 'none';
    imgPlaceholder.style.display = 'flex';
    btnOcr.disabled = true;
    if (btnYandexOcr) btnYandexOcr.disabled = true;
    results.classList.add('hidden');
  });

  btnRecalc.addEventListener('click', () => {
    const tl_sugar = classifyTraffic(parseFloat(nutrSugar.value), THRESHOLDS.sugar);
    const tl_fat = classifyTraffic(parseFloat(nutrFat.value), THRESHOLDS.fat);
    const tl_salt = classifyTraffic(parseFloat(nutrSalt.value), THRESHOLDS.salt);
    setPill(tlSugar, tl_sugar.level, tl_sugar.label);
    setPill(tlFat, tl_fat.level, tl_fat.label);
    setPill(tlSalt, tl_salt.level, tl_salt.label);
  });

  if (btnGeneratePDF) {
    btnGeneratePDF.addEventListener('click', generatePDFReport);
  }

  if (btnSaveToHistory) {
    btnSaveToHistory.addEventListener('click', () => {
      if (!lastAnalysis) return;
      let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history.unshift({ ...lastAnalysis, timestamp: Date.now() });
      if (history.length > 20) history = history.slice(0, 20);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      alert('\u2705 \u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u044e!');
      loadHistory();
    });
  }

  if (btnCompare) {
    btnCompare.addEventListener('click', saveToComparison);
  }

  if (btnOpenAbout) {
    btnOpenAbout.addEventListener('click', () => aboutDialog.showModal());
  }

  loadDb();
  loadHistory();

  console.log('\ud83c\udf10 LabelSpy 3.0 - YANDEX OCR Backend Integration');
  console.log('\u2705 API Key secured in backend environment');
  console.log('\ud83d\udce1 OCR Endpoint: /api/ocr');
})();
