(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const fileInput = $('#fileInput');
  const imgPreview = $('#imgPreview');
  const imgPlaceholder = $('#imgPlaceholder');
  const btnYandexOcr = $('#btnYandexOcr');
  const btnUseSample = $('#btnUseSample');
  const ocrLang = $('#ocrLang');
  const ocrStatus = $('#ocrStatus');
  const ocrBar = $('#ocrBar');
  const ocrStatusText = $('#ocrStatusText');
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

  // 🌐 YANDEX OCR BACKEND ENDPOINT (API key secured in backend)
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
    if (status && ocrStatusText) ocrStatusText.textContent = status;
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
      
      const languages = (ocrLang.value || 'rus+eng')
        .split('+')
        .map(l => l.startsWith('rus') ? 'ru' : 'en');

      console.log(`📸 [Frontend] Image size: ~${Math.round(imageDataUrl.length / 1024)}KB, Languages: ${languages}`);
      console.log('📤 [Frontend] Sending to /api/ocr...');
      
      const response = await fetch(YANDEX_OCR_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          languages: languages
        })
      });

      console.log(`📥 [Frontend] Response status: ${response.status}`);

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          const text = await response.text();
          if (text.includes('html') || text.includes('<!DOCTYPE')) {
            errorMsg = '❌ Backend не расположен или переменные не установлены';
          }
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('✅ [Frontend] OCR Result received');

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
        
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          const normalized = Math.pow(gray / 255, 0.75) * 255;
          const bw = normalized > 128 ? 255 : 0;
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
      .replace(/\u041e([0-9])/g, '0$1')
      .replace(/\u0417/g, '3').replace(/\u0437/g, '3')
      .replace(/l/g, '1')
      .replace(/\u0401/g, '\u0415').replace(/\u0451/g, '\u0435')
      .replace(/[^\w\s\u0401\u0451\u0410-\u042f\u0430-\u044f()\-.,+\u00d7\u00f7=%\n]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/([\u0415E])\s+([0-9])/g, 'E$2')
      .replace(/E([0-9]{3,4})\s+([a-z])/g, 'E$1$2')
      .replace(/\s+,/g, ',')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim();
  }

  function normalizeEcode(raw) {
    if (!raw) return null;
    let x = raw.toUpperCase().replace(/[\u0415E]/g, 'E').replace(/[\u041eO0]/g, '0').replace(/\s+/g, '');
    const m = x.match(/^E-?(\d{3,4})([A-Z])?$/);
    return m ? 'E' + m[1] + (m[2] ? m[2].toLowerCase() : '') : null;
  }

  function extractEcodes(text) {
    const t = (text || '').toUpperCase().replace(/[\u0415E]/g, 'E').replace(/[\u041eO0]/g, '0');
    const found = new Set();
    let m;
    const re = /\bE\s*[-\u2013]?\s*(\d{3,4})([A-Z])?\b/g;
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
    const markers = ['\u0441\u043e\u0441\u0442\u0430\u0432:', '\u0441\u043e\u0441\u0442\u0430\u0432 -'];
    let start = -1;
    for (const m of markers) {
      const idx = lower.indexOf(m);
      if (idx !== -1) { start = idx + m.length; break; }
    }
    let cut = (start !== -1) ? text.slice(start) : text;
    const stopMarkers = ['\u043f\u0438\u0449\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u044c', '\u044d\u043d\u0435\u0440\u0433\u0435\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f'];
    let stopPos = cut.length;
    const cutLower = cut.toLowerCase();
    for (const s of stopMarkers) {
      const idx = cutLower.indexOf(s);
      if (idx !== -1) stopPos = Math.min(stopPos, idx);
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
    { label: '\u041c\u043e\u043b\u043e\u043a\u043e', patterns: ['\u043c\u043e\u043b\u043e\u043a', '\u043b\u0430\u043a\u0442\u043e\u0437', '\u043a\u0430\u0437\u0435\u0438\u043d'] },
    { label: '\u0413\u043b\u044e\u0442\u0435\u043d', patterns: ['\u0433\u043b\u044e\u0442\u0435\u043d', '\u043f\u0448\u0435\u043d\u0438\u0446', '\u0440\u043e\u0436', '\u044f\u0447\u043c\u0435\u043d'] },
    { label: '\u0421\u043e\u044f', patterns: ['\u0441\u043e\u044f', '\u0441\u043e\u0435\u0432'] },
    { label: '\u042f\u0439\u0446\u0430', patterns: ['\u044f\u0438\u0446', '\u0430\u043b\u044c\u0431\u0443\u043c\u0438\u043d'] },
    { label: '\u041e\u0440\u0435\u0445\u0438', patterns: ['\u043e\u0440\u0435\u0445', '\u043c\u0438\u043d\u0434\u0430\u043b', '\u0444\u0443\u043d\u0434\u0443\u043a'] },
    { label: '\u0420\u044b\u0431\u0430', patterns: ['\u0440\u044b\u0431', '\u043b\u043e\u0441\u043e\u0441'] }
  ];

  const hiddenSugars = ['\u0433\u043b\u044e\u043a\u043e\u0437\u043d\u044b\u0439 \u0441\u0438\u0440\u043e\u043f', '\u0444\u0440\u0443\u043a\u0442\u043e\u0437\u043d\u044b\u0439 \u0441\u0438\u0440\u043e\u043f', '\u043c\u0430\u043b\u044c\u0442\u043e\u0434\u0435\u043a\u0441\u0442\u0440\u0438\u043d', '\u043f\u0430\u0442\u043e\u043a\u0430'];

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
    return hiddenSugars.filter(s => t.includes(s));
  }

  const THRESHOLDS = {
    sugar: { lowMax: 5.0, highMin: 22.5 },
    fat: { lowMax: 3.0, highMin: 17.5 },
    salt: { lowMax: 0.3, highMin: 1.75 }
  };

  function classifyTraffic(value, th) {
    if (!Number.isFinite(value)) return { level: 'unknown', label: '\u2014' };
    if (value <= th.lowMax) return { level: 'green', label: `\u043d\u0438\u0437\u043a. (${value})` };
    if (value > th.highMin) return { level: 'red', label: `\u0432\u044b\u0441\u043e\u043a. (${value})` };
    return { level: 'yellow', label: `\u0441\u0440\u0435\u0434. (${value})` };
  }

  function setPill(el, cls, text) {
    el.className = 'pill pill-' + cls;
    el.textContent = text;
  }

  function computeOverallVerdict(eItems, allergenList, sugarHints, tl) {
    let score = 100;
    for (const item of eItems) score -= (item.attention === '\u0432\u044b\u0441\u043e\u043a\u0438\u0439' ? 15 : 5);
    score -= allergenList.length * 8;
    score -= sugarHints.length * 6;
    const penalty = lvl => lvl === 'red' ? 20 : (lvl === 'yellow' ? 10 : 0);
    score -= penalty(tl.sugar.level) + penalty(tl.fat.level) + penalty(tl.salt.level);
    score = Math.max(0, Math.min(100, score));
    if (score >= 75) return { color: 'green', title: '\u2705 \u0417\u0435\u043b\u0451\u043d\u0430\u044f', body: '\u041d\u0435\u0439\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0441\u043e\u0441\u0442\u0430\u0432' };
    if (score >= 45) return { color: 'yellow', title: '\u26a0\ufe0f \u0416\u0451\u043b\u0442\u0430\u044f', body: '\u041d\u0435\u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0440\u0438\u0441\u043a\u0438' };
    return { color: 'red', title: '\ud83d\udeab \u041a\u0440\u0430\u0441\u043d\u0430\u044f', body: '\u041c\u043d\u043e\u0433\u043e \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f' };
  }

  function setVerdict(v) {
    overallVerdict.classList.remove('verdict-green', 'verdict-yellow', 'verdict-red');
    overallVerdict.classList.add('verdict-' + v.color);
    overallTitle.textContent = v.title;
    overallBody.textContent = v.body;
  }

  function loadHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const historyContent = document.getElementById('historyContent');
    if (history.length === 0) {
      historyBlock.classList.add('hidden');
      return;
    }
    historyBlock.classList.remove('hidden');
    historyContent.innerHTML = history.slice(0, 5).map((item, idx) => `
      <div class="history-item">
        <strong>\ud83d\udcca #${history.length - idx}</strong>
        <span class="pill pill-${item.verdict?.color}">${item.verdict?.title}</span>
      </div>
    `).join('');
  }

  async function generatePDFReport() {
    if (!lastAnalysis || !window.jspdf) {
      alert('\u26a0\ufe0f \u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445');
      return;
    }
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('LabelSpy - \u041e\u0442\u0447\u0435\u0442', 20, 20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(lastAnalysis.ecodes.join(', ') || '\u041d\u0435\u0442', 20, 40);
      doc.save(`labelspy-${Date.now()}.pdf`);
    } catch (e) {
      console.error('PDF error:', e);
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastImageDataUrl = await toDataUrl(file);
    imgPreview.src = lastImageDataUrl;
    imgPreview.style.display = 'block';
    imgPlaceholder.style.display = 'none';
    btnYandexOcr.disabled = false;
  });

  btnYandexOcr.addEventListener('click', async () => {
    if (!lastImageDataUrl) return;
    btnYandexOcr.disabled = true;
    ocrStatus.classList.remove('hidden');
    try {
      setOcrProgress(0.1, '\ud83c\udf10 \u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...');
      const text = await recognizeWithYandex(lastImageDataUrl);
      setOcrProgress(0.9, '\u2728 \u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430...');
      textInput.value = cleanOCRText(text);
      setOcrProgress(1, '\u2705 \u0413\u043e\u0442\u043e\u0432\u043e!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 800);
    } catch (e) {
      ocrStatus.classList.add('hidden');
      alert(`\u274c ${e.message}\n\n\ud83d\udca1 \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439:\n- \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\n- \u041d\u0430\u0441\u0442\u0440\u043e\u0439 backend`);
    }
    btnYandexOcr.disabled = false;
  });

  btnUseSample.addEventListener('click', () => {
    textInput.value = '\u0421\u043e\u0441\u0442\u0430\u0432: \u0432\u043e\u0434\u0430, \u043f\u0448\u0435\u043d\u0438\u0446\u0430, \u0441\u0430\u0445\u0430\u0440, \u043c\u043e\u043b\u043e\u043a\u043e, E621, E330. \u041f\u0438\u0449\u0435\u0432\u0430\u044f \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u044c: \u0441\u0430\u0445\u0430\u0440 15\u0433, \u0436\u0438\u0440\u044b 8\u0433, \u0441\u043e\u043b\u044c 0.5\u0433.';
  });

  btnAnalyze.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      alert('\u26a0\ufe0f \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0442\u0435\u043a\u0441\u0442');
      return;
    }

    const ecodes = extractEcodes(text);
    const allergens_found = detectAllergens(text);
    const hidden_sugars = detectHiddenSugars(text);
    const nutrients = autoExtractNutrients(text);

    nutrSugar.value = nutrients.sugar || '';
    nutrFat.value = nutrients.fat || '';
    nutrSalt.value = nutrients.salt || '';

    const tl_sugar = classifyTraffic(nutrients.sugar, THRESHOLDS.sugar);
    const tl_fat = classifyTraffic(nutrients.fat, THRESHOLDS.fat);
    const tl_salt = classifyTraffic(nutrients.salt, THRESHOLDS.salt);

    setPill(tlSugar, tl_sugar.level, tl_sugar.label);
    setPill(tlFat, tl_fat.level, tl_fat.label);
    setPill(tlSalt, tl_salt.level, tl_salt.label);

    const eItems = ecodes.map(code => eDb[code] || { name_ru: code });
    const verdict = computeOverallVerdict(eItems, allergens_found, hidden_sugars, { sugar: tl_sugar, fat: tl_fat, salt: tl_salt });
    setVerdict(verdict);

    lastAnalysis = { ecodes, allergens: allergens_found, sugars: hidden_sugars, nutrients, verdict, timestamp: Date.now() };

    metricEcodes.textContent = ecodes.length;
    metricAllergens.textContent = allergens_found.length;
    metricSugars.textContent = hidden_sugars.length;

    if (allergens_found.length > 0) {
      allergensBlock.classList.remove('hidden');
      document.getElementById('allergensContent').innerHTML = allergens_found.map(a => `<span class="pill pill-high">${a}</span>`).join('');
    } else {
      allergensBlock.classList.add('hidden');
    }

    if (ecodes.length > 0) {
      ecodesTable.classList.remove('hidden');
      const rows = ecodes.map(code => {
        const item = eDb[code] || {};
        const cls = item.attention === '\u0432\u044b\u0441\u043e\u043a\u0438\u0439' ? 'badge-high' : 'badge-low';
        return `<tr><td>${code}</td><td>${item.name_ru || code}</td><td><span class="badge ${cls}">${item.attention || '?'}</span></td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>\u041a\u043e\u0434</th><th>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</th><th>\u041e\u0446\u0435\u043d\u043a\u0430</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    btnYandexOcr.disabled = true;
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

  if (btnGeneratePDF) btnGeneratePDF.addEventListener('click', generatePDFReport);
  if (btnSaveToHistory) btnSaveToHistory.addEventListener('click', () => {
    if (!lastAnalysis) return;
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({ ...lastAnalysis, timestamp: Date.now() });
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    loadHistory();
  });
  if (btnCompare) btnCompare.addEventListener('click', () => { if (lastAnalysis) alert('\u2705 \u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e'); });
  if (btnOpenAbout) btnOpenAbout.addEventListener('click', () => aboutDialog.showModal());

  loadDb();
  loadHistory();

  console.log('\ud83c\udf10 LabelSpy 3.0 - Yandex OCR Backend');
  console.log('\u2705 Secure API - no keys in frontend');
  console.log('\ud83d\udce1 Endpoint: /api/ocr');
})();
