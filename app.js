(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const fileInput = $('#fileInput');
  const imgPreview = $('#imgPreview');
  const imgPlaceholder = $('#imgPlaceholder');
  const btnOcr = $('#btnOcr');
  const btnGeminiOcr = $('#btnGeminiOcr');
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
  const btnGenerateCard = $('#btnGenerateCard');
  const btnSaveToHistory = $('#btnSaveToHistory');
  const btnCompare = $('#btnCompare');
  const historyBlock = $('#historyBlock');
  const aboutDialog = $('#aboutDialog');
  const btnOpenAbout = $('#btnOpenAbout');
  const githubLink = $('#githubLink');

  githubLink.href = 'https://github.com/' + (window.__LABELSPY_REPO || '');

  // 🔑 NEW Google Gemini API Key
  const GEMINI_API_KEY = 'AIzaSyAh-NcbJIlwHQ8v5UJLfXPBCHbZqC03xwo';
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  let eDb = {};
  let lastAnalysis = null;
  let lastImageDataUrl = null;
  const HISTORY_KEY = 'labelspy_v2_history';
  const COMPARE_KEY = 'labelspy_v2_compare';

  async function loadDb() {
    try {
      const res = await fetch('./data/e_additives_ru.json', { cache: 'no-cache' });
      eDb = await res.json();
    } catch (e) {
      console.error('DB load error:', e);
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

  // 🤖 GEMINI VISION OCR: Perfect text recognition
  async function recognizeWithGemini(imageDataUrl) {
    try {
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)[1];

      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Ты эксперт по распознаванию пищевых этикеток. Распознай ВЕСЬ текст с этой этикетки максимально точно.

Требования:
1. Верни ТОЛЬКО распознанный текст БЕЗ комментариев
2. Сохраняй структуру: "Состав:", "Пищевая ценность:"
3. E-коды пиши как E621, E330 (без пробелов)
4. Числа с единицами: "15г", "8г" (без пробела)
5. Если текст нечеткий - делай лучшее предположение
6. НЕ добавляй пояснения

Просто распознай текст точно.` },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      });

      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Gemini OCR error:', error);
      throw error;
    }
  }

  // 🤖 GEMINI ANALYTICS: AI-powered composition analysis
  async function analyzeWithGemini(compositionText) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Ты эксперт-нутрициолог. Проанализируй состав продукта и дай краткую оценку (2-3 предложения).

Состав:
${compositionText}

Оцени:
1. Наличие вредных E-кодов (консерванты, красители)
2. Скрытые сахара (сиропы, декстроза)
3. Аллергены (молоко, глютен, соя)
4. Общее качество продукта

Ответ дай КРАТКО, простым языком для обычного покупателя.` }]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      });

      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Gemini analytics error:', error);
      return null;
    }
  }

  // 🎨 GEMINI CARD GENERATION: Beautiful AI-generated analysis card
  async function generateCardWithGemini(analysis) {
    try {
      const { ecodes, allergens, sugars, nutrients, composition } = analysis;
      const prompt = `Создай красивое HTML-описание анализа продукта для веб-карточки.

Данные:
- E-коды: ${ecodes.join(', ') || 'не обнаружены'}
- Аллергены: ${allergens.join(', ') || 'не обнаружены'}
- Скрытые сахара: ${sugars.join(', ') || 'не обнаружены'}
- Сахар: ${nutrients.sugar || '—'}г, Жир: ${nutrients.fat || '—'}г, Соль: ${nutrients.salt || '—'}г
- Состав: ${composition || '—'}

Требования:
1. Верни ТОЛЬКО HTML-код (без markdown, без \`\`\`)
2. Используй <div>, <p>, <strong>, <span>
3. Добавь emoji для визуала
4. Структура: заголовок → краткий анализ → рекомендация
5. Стиль: font-size:14px, line-height:1.6, цвета rgb(231,238,252)
6. Максимум 200 слов

Верни ТОЛЬКО чистый HTML без обёртки.`;

      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
        })
      });

      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
      const data = await response.json();
      let html = data.candidates[0].content.parts[0].text.trim();
      html = html.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
      return html;
    } catch (error) {
      console.error('Gemini card error:', error);
      return '<div>❌ Ошибка генерации карточки</div>';
    }
  }

  // 🎨 Advanced Image Preprocessing
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
        
        // OTSU Adaptive Threshold
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
      .replace(/([а-яё])О([а-яё])/g, '$1о$2')
      .replace(/([0-9])О(?=[^0-9])/g, '$10')
      .replace(/О([0-9])/g, '0$1')
      .replace(/З/g, '3').replace(/з/g, '3')
      .replace(/l/g, '1')
      .replace(/Ё/g, 'Е').replace(/ё/g, 'е')
      .replace(/[^\w\sЁёА-Яа-я()\-.,+×÷=\n]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/([ЕE])\s+([0-9])/g, 'E$2')
      .replace(/([ЕE])-([0-9])/g, 'E$2')
      .replace(/([ЕE])–([0-9])/g, 'E$2')
      .replace(/E([0-9]{3,4})\s+([a-z])/g, 'E$1$2')
      .replace(/\s+,/g, ',')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/(\d),\s*(\d)/g, '$1.$2')
      .trim();
  }

  function normalizeEcode(raw) {
    if (!raw) return null;
    let x = raw.toUpperCase().replace(/[ЕE]/g, 'E').replace(/[ОO0]/g, '0');
    x = x.replace(/\s+/g, '');
    const m = x.match(/^E-?(\d{3,4})([A-Z])?$/);
    if (!m) return null;
    return 'E' + m[1] + (m[2] ? m[2].toLowerCase() : '');
  }

  function extractEcodes(text) {
    const t = (text || '').toUpperCase().replace(/[ЕE]/g, 'E').replace(/[ОO0]/g, '0');
    const re = /\bE\s*[-–]?\s*(\d{3,4})([A-Z])?\b/g;
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
    const markers = ['состав:', 'состав -', 'ингредиенты:'];
    let start = -1;
    for (const m of markers) {
      const idx = lower.indexOf(m);
      if (idx !== -1) { start = idx + m.length; break; }
    }
    let cut = (start !== -1) ? text.slice(start) : text;
    const stopMarkers = ['пищевая ценность', 'энергетическая ценность', 'на 100'];
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
        const re = new RegExp(lbl + String.raw`\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*г`, 'i');
        const m = t.match(re);
        if (m && m[1]) return parseFloat(m[1]);
      }
      return null;
    };
    return {
      sugar: read(['сахара', 'сахар']),
      fat: read(['жиры', 'жир']),
      salt: read(['соль', 'натрий'])
    };
  }

  const allergens = [
    { key: 'milk', label: 'Молоко', patterns: ['молок', 'лактоз', 'сыворотк', 'казеин', 'сливк'] },
    { key: 'gluten', label: 'Глютен', patterns: ['глютен', 'пшениц', 'рож', 'ячмен', 'овёс', 'мука'] },
    { key: 'soy', label: 'Соя', patterns: ['соя', 'соев'] },
    { key: 'eggs', label: 'Яйца', patterns: ['яиц', 'альбумин'] },
    { key: 'nuts', label: 'Орехи', patterns: ['орех', 'миндал', 'фундук', 'арахис'] },
    { key: 'fish', label: 'Рыба', patterns: ['рыб', 'лосос', 'тунец'] }
  ];

  const hiddenSugars = ['глюкозный сироп', 'фруктозный сироп', 'инвертный сироп', 'патока', 'мальтодекстрин', 'декстроза', 'сироп', 'мёд', 'сахароза', 'фруктоза', 'глюкоза'];

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
    sugar: { lowMax: 5.0, highMin: 22.5, unit: 'г/100г' },
    fat: { lowMax: 3.0, highMin: 17.5, unit: 'г/100г' },
    salt: { lowMax: 0.3, highMin: 1.75, unit: 'г/100г' }
  };

  function classifyTraffic(value, th) {
    if (value == null || !Number.isFinite(value)) return { level: 'unknown', label: '—' };
    if (value <= th.lowMax) return { level: 'green', label: `низк. (${value} ${th.unit})` };
    if (value > th.highMin) return { level: 'red', label: `высок. (${value} ${th.unit})` };
    return { level: 'yellow', label: `средн. (${value} ${th.unit})` };
  }

  function setPill(el, cls, text) {
    el.className = 'pill pill-' + cls;
    el.textContent = text;
  }

  function computeOverallVerdict(eItems, allergenList, sugarHints, tl) {
    let score = 100;
    const byAttention = { низкий: 1, средний: 2, высокий: 3 };
    for (const it of eItems) {
      score -= (byAttention[it.attention || 'средний'] || 2) * 5;
    }
    score -= Math.min(20, allergenList.length * 6);
    score -= Math.min(15, sugarHints.length * 5);
    const penalty = (lvl) => lvl === 'red' ? 25 : (lvl === 'yellow' ? 10 : 0);
    score -= penalty(tl.sugar.level) + penalty(tl.fat.level) + penalty(tl.salt.level);
    score = Math.max(0, Math.min(100, score));
    if (score >= 75) return { color: 'green', title: '✅ Зелёная зона', body: 'Достаточно нейтральный состав, мало "красных" сигналов.' };
    if (score >= 45) return { color: 'yellow', title: '⚠️ Жёлтая зона', body: 'Есть факторы внимания. Рекомендуется умеренность.' };
    return { color: 'red', title: '🚫 Красная зона', body: 'Много факторов внимания. Для регулярного употребления лучше сравнить с альтернативами.' };
  }

  function setVerdict(v) {
    overallVerdict.classList.remove('verdict-green', 'verdict-yellow', 'verdict-red');
    overallVerdict.classList.add('verdict-' + v.color);
    overallTitle.textContent = v.title;
    overallBody.textContent = v.body;
  }

  // 📊 Save to comparison
  function saveToComparison() {
    if (!lastAnalysis) return;
    let compare = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
    const item = { ...lastAnalysis, timestamp: Date.now(), id: Date.now() };
    compare.push(item);
    if (compare.length > 5) compare = compare.slice(-5);
    localStorage.setItem(COMPARE_KEY, JSON.stringify(compare));
    alert('✅ Добавлено в сравнение!');
  }

  // 📜 Load history
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
          <strong>📊 Анализ #${history.length - idx}</strong>
          <span class="muted small">${new Date(item.timestamp).toLocaleDateString('ru')}</span>
        </div>
        <div class="history-body">
          <span class="pill pill-${item.verdict?.color || 'unknown'}">${item.verdict?.title || 'Н/Д'}</span>
          <span class="muted small">E-коды: ${item.ecodes?.length || 0}, Аллергены: ${item.allergens?.length || 0}</span>
        </div>
      </div>
    `).join('');
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastImageDataUrl = await toDataUrl(file);
    imgPreview.src = lastImageDataUrl;
    imgPreview.style.display = 'block';
    imgPlaceholder.style.display = 'none';
    btnOcr.disabled = false;
    if (btnGeminiOcr) btnGeminiOcr.disabled = false;
  });

  // Tesseract OCR
  btnOcr.addEventListener('click', async () => {
    if (!lastImageDataUrl) return;
    btnOcr.disabled = true;
    ocrStatus.classList.remove('hidden');
    try {
      setOcrProgress(0.1, '🖼️ Обработка изображения...');
      const processed = await preprocessImage(lastImageDataUrl);
      
      setOcrProgress(0.3, '🔍 Распознавание текста Tesseract...');
      const { data: { text } } = await Tesseract.recognize(processed, 'rus+eng', {
        logger: m => setOcrProgress(0.3 + m.progress * 0.6, m.status)
      });
      
      setOcrProgress(0.95, '✨ Очистка текста...');
      textInput.value = cleanOCRText(text);
      
      setOcrProgress(1, '✅ Готово!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 500);
    } catch (e) {
      console.error('OCR Error:', e);
      ocrStatus.classList.add('hidden');
      alert('❌ Ошибка OCR. Попробуйте ещё раз.');
    }
    btnOcr.disabled = false;
  });

  // Gemini Vision OCR
  if (btnGeminiOcr) {
    btnGeminiOcr.addEventListener('click', async () => {
      if (!lastImageDataUrl) return;
      btnGeminiOcr.disabled = true;
      ocrStatus.classList.remove('hidden');
      try {
        setOcrProgress(0.2, '🤖 Отправка в Gemini Vision API...');
        const text = await recognizeWithGemini(lastImageDataUrl);
        
        setOcrProgress(0.9, '✨ Обработка результата...');
        textInput.value = cleanOCRText(text);
        
        setOcrProgress(1, '✅ Gemini распознал идеально!');
        setTimeout(() => ocrStatus.classList.add('hidden'), 500);
      } catch (e) {
        console.error('Gemini Error:', e);
        ocrStatus.classList.add('hidden');
        alert('❌ Ошибка Gemini API. Проверьте ключ или используйте Tesseract.');
      }
      btnGeminiOcr.disabled = false;
    });
  }

  btnUseSample.addEventListener('click', () => {
    textInput.value = 'Состав: вода, пшеничная мука, сахар, масло сливочное, яйца, молоко, соль, E621, E330, разрыхлитель (E500ii). Пищевая ценность на 100г: сахар 15г, жиры 8г, соль 0.5г.';
  });

  btnAnalyze.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;

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

    const eItems = ecodes.map(code => eDb[code] || { name_ru: code, attention: 'неизвестно' });
    const verdict = computeOverallVerdict(eItems, allergens_found, hidden_sugars, { sugar: tl_sugar, fat: tl_fat, salt: tl_salt });
    setVerdict(verdict);

    lastAnalysis = { ecodes, allergens: allergens_found, sugars: hidden_sugars, nutrients, composition: compositionBlock, verdict, timestamp: Date.now() };

    metricEcodes.textContent = ecodes.length;
    metricAllergens.textContent = allergens_found.length;
    metricSugars.textContent = hidden_sugars.length;
    compositionSnippet.textContent = compositionBlock || '—';

    // 🤖 AI Analysis
    if (compositionBlock) {
      const aiAnalysis = $('#aiAnalysis');
      if (aiAnalysis) {
        aiAnalysis.classList.remove('hidden');
        aiAnalysis.innerHTML = '<div class="pill pill-yellow">⏳ Анализирую состав с помощью AI...</div>';
        
        try {
          const analysis = await analyzeWithGemini(compositionBlock);
          if (analysis) {
            aiAnalysis.innerHTML = `<div class="ai-insight"><strong>🤖 AI-анализ:</strong> ${analysis}</div>`;
          }
        } catch (e) {
          aiAnalysis.innerHTML = '<div class="pill pill-yellow">⚠️ AI-анализ временно недоступен</div>';
        }
      }
    }

    if (allergens_found.length > 0) {
      allergensBlock.classList.remove('hidden');
      $('#allergensContent').innerHTML = allergens_found.map(a => `<span class="pill pill-high">${a}</span>`).join('');
    }

    if (hidden_sugars.length > 0) {
      $('#sugarsBlock').classList.remove('hidden');
      $('#sugarsContent').innerHTML = hidden_sugars.map(s => `<span class="pill pill-yellow">${s}</span>`).join('');
    }

    if (ecodes.length > 0) {
      ecodesTable.classList.remove('hidden');
      const rows = ecodes.map(code => {
        const item = eDb[code] || {};
        const name = item.name_ru || code;
        const attention = item.attention || 'неизвестно';
        const notes = item.notes_ru || '—';
        const cls = attention === 'высокий' ? 'badge-high' : (attention === 'средний' ? 'badge-mid' : 'badge-low');
        return `<tr><td class="mono">${code}</td><td>${name}</td><td><span class="badge ${cls}">${attention}</span></td><td>${notes}</td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>Код</th><th>Название</th><th>Оценка</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    if (btnGeminiOcr) btnGeminiOcr.disabled = true;
  });

  btnRecalc.addEventListener('click', () => {
    const tl_sugar = classifyTraffic(parseFloat(nutrSugar.value), THRESHOLDS.sugar);
    const tl_fat = classifyTraffic(parseFloat(nutrFat.value), THRESHOLDS.fat);
    const tl_salt = classifyTraffic(parseFloat(nutrSalt.value), THRESHOLDS.salt);
    setPill(tlSugar, tl_sugar.level, tl_sugar.label);
    setPill(tlFat, tl_fat.level, tl_fat.label);
    setPill(tlSalt, tl_salt.level, tl_salt.label);
  });

  // 🎨 Generate Beautiful Card with Gemini
  if (btnGenerateCard) {
    btnGenerateCard.addEventListener('click', async () => {
      if (!lastAnalysis) return;
      btnGenerateCard.disabled = true;
      btnGenerateCard.textContent = '⏳ Генерация...';
      
      try {
        const html = await generateCardWithGemini(lastAnalysis);
        const cardDialog = $('#cardDialog') || document.createElement('dialog');
        cardDialog.id = 'cardDialog';
        cardDialog.className = 'dialog card-dialog';
        cardDialog.innerHTML = `
          <form method="dialog">
            <div class="card-preview">${html}</div>
            <div class="dialog-actions">
              <button class="btn btn-secondary" id="btnDownloadCard">📥 Скачать PNG</button>
              <button class="btn btn-primary">Закрыть</button>
            </div>
          </form>
        `;
        if (!$('#cardDialog')) document.body.appendChild(cardDialog);
        cardDialog.showModal();
        
        $('#btnDownloadCard')?.addEventListener('click', async () => {
          const cardPreview = $('.card-preview');
          if (cardPreview && typeof html2canvas !== 'undefined') {
            const canvas = await html2canvas(cardPreview);
            const link = document.createElement('a');
            link.href = canvas.toDataURL();
            link.download = 'labelspy-card.png';
            link.click();
          } else {
            alert('📷 Скачивание пока недоступно. Сделайте скриншот вручную.');
          }
        });
      } catch (e) {
        console.error('Card generation error:', e);
        alert('❌ Ошибка генерации карточки');
      }
      
      btnGenerateCard.disabled = false;
      btnGenerateCard.textContent = '🎨 Сгенерировать карточку AI';
    });
  }

  if (btnSaveToHistory) {
    btnSaveToHistory.addEventListener('click', () => {
      if (!lastAnalysis) return;
      let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history.unshift({ ...lastAnalysis, timestamp: Date.now() });
      if (history.length > 20) history = history.slice(0, 20);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      alert('✅ Сохранено в историю!');
      loadHistory();
    });
  }

  if (btnCompare) {
    btnCompare.addEventListener('click', saveToComparison);
  }

  if (btnOpenAbout) {
    btnOpenAbout.addEventListener('click', () => aboutDialog.showModal());
  }

  // Initialize
  loadDb();
  loadHistory();
})();
