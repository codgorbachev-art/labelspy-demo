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

  const YANDEX_OCR_ENDPOINT = '/api/ocr';

  let eDb = {};
  let lastAnalysis = null;
  let lastImageDataUrl = null;
  const HISTORY_KEY = 'labelspy_v3_history';

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

  async function recognizeWithYandex(imageDataUrl) {
    try {
      console.log('🌐 [Frontend] Starting Yandex OCR...');
      
      const languages = (ocrLang.value || 'rus+eng')
        .split('+')
        .map(l => l.startsWith('rus') ? 'ru' : 'en');

      console.log(`📸 [Frontend] Image size: ${Math.round(imageDataUrl.length / 1024)}KB, Languages: ${JSON.stringify(languages)}`);
      console.log('📤 [Frontend] Sending to /api/ocr...');
      
      const response = await fetch(YANDEX_OCR_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          languages: languages
        })
      });

      console.log(`📥 [Frontend] Response status: ${response.status}`);

      // Parse response once
      const data = await response.json();
      console.log('[Frontend] Response body:', data);

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: Backend error`);
      }

      if (!data.success) {
        throw new Error(data.error || 'OCR failed (backend returned success=false)');
      }

      if (!data.text) {
        throw new Error('No text extracted from image');
      }

      console.log('✅ [Frontend] OCR succeeded, text length:', data.text.length);
      return data.text;
      
    } catch (error) {
      console.error('❌ [Frontend] Yandex OCR error:', error);
      throw error;
    }
  }

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
      img.onerror = () => resolve(imageDataUrl);
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
    { label: '🥛 Молоко', patterns: ['молоко', 'лактоз', 'казеин'] },
    { label: '🌾 Глютен', patterns: ['глютен', 'пшениц', 'рож', 'ячмен'] },
    { label: '🫘 Соя', patterns: ['соя', 'соев'] },
    { label: '🥚 Яйца', patterns: ['яиц', 'альбумин'] },
    { label: '🥜 Орехи', patterns: ['орех', 'миндал', 'фундук'] },
    { label: '🐟 Рыба', patterns: ['рыб', 'лосос'] }
  ];

  const hiddenSugars = ['глюкозный сироп', 'фруктозный сироп', 'мальтодекстрин', 'патока'];

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
    if (!Number.isFinite(value)) return { level: 'unknown', label: '—' };
    if (value <= th.lowMax) return { level: 'green', label: `низк. (${value})` };
    if (value > th.highMin) return { level: 'red', label: `высок. (${value})` };
    return { level: 'yellow', label: `сред. (${value})` };
  }

  function setPill(el, cls, text) {
    el.className = 'pill pill-' + cls;
    el.textContent = text;
  }

  function computeOverallVerdict(eItems, allergenList, sugarHints, tl) {
    let score = 100;
    for (const item of eItems) score -= (item.attention === 'высокий' ? 15 : 5);
    score -= allergenList.length * 8;
    score -= sugarHints.length * 6;
    const penalty = lvl => lvl === 'red' ? 20 : (lvl === 'yellow' ? 10 : 0);
    score -= penalty(tl.sugar.level) + penalty(tl.fat.level) + penalty(tl.salt.level);
    score = Math.max(0, Math.min(100, score));
    if (score >= 75) return { color: 'green', title: '✅ Зелёная', body: 'Нейтральный состав' };
    if (score >= 45) return { color: 'yellow', title: '⚠️ Жёлтая', body: 'Некоторые риски' };
    return { color: 'red', title: '🚫 Красная', body: 'Много внимания' };
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
        <strong>📊 #${history.length - idx}</strong>
        <span class="pill pill-${item.verdict?.color}">${item.verdict?.title}</span>
      </div>
    `).join('');
  }

  async function generatePDFReport() {
    if (!lastAnalysis || !window.jspdf) {
      alert('⚠️ Нет данных');
      return;
    }
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('LabelSpy - Отчет', 20, 20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(lastAnalysis.ecodes.join(', ') || 'Нет', 20, 40);
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
      setOcrProgress(0.2, '🔄 Подготовка...');
      setOcrProgress(0.5, '📤 Отправка на Yandex...');
      const text = await recognizeWithYandex(lastImageDataUrl);
      setOcrProgress(0.9, '✨ Обработка...');
      textInput.value = cleanOCRText(text);
      setOcrProgress(1, '✅ Готово!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 800);
    } catch (e) {
      ocrStatus.classList.add('hidden');
      console.error('Full error:', e);
      let userMsg = e.message;
      if (userMsg.includes('Configuration')) {
        userMsg = '⚙️ Backend не настроен.\nУстанови переменные на Vercel:\nYANDEX_API_KEY\nYANDEX_FOLDER_ID';
      } else if (userMsg.includes('401') || userMsg.includes('Unauthorized')) {
        userMsg = '🔑 Неверный API Key.\nПроверь YANDEX_API_KEY на Vercel';
      } else if (userMsg.includes('403') || userMsg.includes('Forbidden')) {
        userMsg = '🚫 Неверный Folder ID.\nПроверь YANDEX_FOLDER_ID на Vercel';
      } else if (userMsg.includes('HTTP') || userMsg.includes('405')) {
        userMsg = '❌ Backend недоступен или ошибка.\nПроверь:\n- интернет\n- Vercel deployment\n- консоль (F12)';
      }
      alert(`Ошибка OCR:\n${userMsg}`);
    }
    btnYandexOcr.disabled = false;
  });

  btnUseSample.addEventListener('click', () => {
    textInput.value = 'Состав: вода, пшеница, сахара, молоко, E621, E330. Пищевая ценность: сахара 15г, жиры 8г, соль 0.5г.';
  });

  btnAnalyze.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      alert('⚠️ Введите текст');
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
        const cls = item.attention === 'высокий' ? 'badge-high' : 'badge-low';
        return `<tr><td>${code}</td><td>${item.name_ru || code}</td><td><span class="badge ${cls}">${item.attention || '?'}</span></td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>Код</th><th>Название</th><th>Оценка</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  if (btnCompare) btnCompare.addEventListener('click', () => { if (lastAnalysis) alert('✅ Добавлено'); });
  if (btnOpenAbout) btnOpenAbout.addEventListener('click', () => aboutDialog.showModal());

  loadDb();
  loadHistory();

  console.log('🌐 LabelSpy 3.0 - Yandex OCR Backend');
  console.log('✅ Secure API - no keys in frontend');
  console.log('📡 Endpoint: /api/ocr');
})();
