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
  const btnGeneratePDF = $('#btnGeneratePDF');
  const btnSaveToHistory = $('#btnSaveToHistory');
  const btnCompare = $('#btnCompare');
  const historyBlock = $('#historyBlock');
  const aboutDialog = $('#aboutDialog');
  const btnOpenAbout = $('#btnOpenAbout');
  const githubLink = $('#githubLink');

  githubLink.href = 'https://github.com/' + (window.__LABELSPY_REPO || '');

  // 🔑 Google Gemini API Key
  const GEMINI_API_KEY = 'AIzaSyAh-NcbJIlwHQ8v5UJLfXPBCHbZqC03xwo';
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  // 🌐 Multiple CORS Proxies (fallback chain for Russia bypass)
  const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-anywhere.herokuapp.com/',
  ];
  
  let currentProxyIndex = 0;

  let eDb = {};
  let lastAnalysis = null;
  let lastImageDataUrl = null;
  const HISTORY_KEY = 'labelspy_v3_history';
  const COMPARE_KEY = 'labelspy_v3_compare';

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

  // 🌐 Try CORS Proxy with fallback
  async function fetchWithProxyFallback(url, options = {}, tryCount = 0) {
    if (tryCount >= CORS_PROXIES.length) {
      throw new Error('All CORS proxies failed');
    }
    
    const proxy = CORS_PROXIES[tryCount];
    const proxiedUrl = proxy + encodeURIComponent(url);
    
    console.log(`🌐 Trying proxy ${tryCount + 1}/${CORS_PROXIES.length}:`, proxy);
    
    try {
      const response = await fetch(proxiedUrl, options);
      if (response.ok) {
        console.log(`✅ Proxy ${tryCount + 1} succeeded!`);
        currentProxyIndex = tryCount;
        return response;
      }
      throw new Error(`Proxy ${tryCount + 1} returned ${response.status}`);
    } catch (error) {
      console.warn(`❌ Proxy ${tryCount + 1} failed:`, error.message);
      return fetchWithProxyFallback(url, options, tryCount + 1);
    }
  }

  // 🤖 GEMINI VISION OCR with enhanced prompts
  async function recognizeWithGemini(imageDataUrl) {
    try {
      const base64Data = imageDataUrl.split(',')[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/jpeg';

      const requestBody = {
        contents: [{
          parts: [
            { 
              text: `Ты профессиональный эксперт по распознаванию текста с пищевых этикеток на русском и английском языках.

ТВОЯ ЗАДАЧА: Распознай ВЕСЬ текст с этой этикетки продукта максимально точно.

📋 КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ:
1. Верни ТОЛЬКО распознанный текст БЕЗ комментариев, пояснений, вступлений
2. Сохраняй оригинальную структуру: "Состав:", "Пищевая ценность:", "Энергетическая ценность:"
3. E-коды пиши слитно: E621, E330, E150d (без пробелов между E и цифрами)
4. Числа с единицами слитно: "15г", "8г", "0.5г" (без пробелов)
5. Проценты: "жиры 8%", "сахар 15%"
6. Если текст нечеткий или поврежден - делай ЛУЧШЕЕ предположение, но НЕ пиши об этом
7. НЕ добавляй пояснения типа "Вот распознанный текст:" или "Текст с этикетки:"
8. НЕ пропускай мелкий текст - распознавай ВСЁ

🎯 ОСОБОЕ ВНИМАНИЕ:
- Разделяй ингредиенты запятыми
- Сохраняй скобки: "разрыхлитель (E500ii)"
- Сохраняй процентные доли: "вода 60%, сахар 15%"
- Сохраняй предупреждения: "Может содержать следы..."

Просто распознай текст точно как на этикетке.` 
            },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { 
          temperature: 0.05,  // Минимальная креативность для точности
          maxOutputTokens: 3072,
          topK: 20,
          topP: 0.9
        }
      };

      const response = await fetchWithProxyFallback(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid Gemini response structure');
      }

      const text = data.candidates[0].content.parts[0].text;
      return text.trim();
    } catch (error) {
      console.error('❌ Gemini OCR error:', error);
      throw error;
    }
  }

  // 🧠 GEMINI ANALYTICS with detailed recommendations
  async function analyzeWithGemini(compositionText) {
    try {
      const requestBody = {
        contents: [{
          parts: [{ 
            text: `Ты эксперт-нутрициолог и токсиколог. Проанализируй состав продукта и дай КРАТКУЮ профессиональную оценку.

Состав продукта:
${compositionText}

📊 ТВОЙ АНАЛИЗ ДОЛЖЕН ВКЛЮЧАТЬ (максимум 5-6 предложений):

1. ⚠️ ОПАСНЫЕ КОМПОНЕНТЫ (если есть):
   - E-коды с высоким риском (консерванты, красители, усилители вкуса)
   - Трансжиры, пальмовое масло
   - Канцерогены или аллергены

2. 🍬 СКРЫТЫЕ САХАРА:
   - Сиропы (глюкозный, фруктозный, инвертный)
   - Декстроза, мальтодекстрин, патока

3. 🚦 ОБЩАЯ ОЦЕНКА:
   - Можно ли употреблять регулярно?
   - Для какой диеты подходит/не подходит?
   - Краткая рекомендация покупателю

✅ ФОРМАТ ОТВЕТА:
Кратко и по делу, простым языком. БЕЗ вступлений типа "Проанализирую состав".

Начни сразу с оценки: "⚠️ Содержит..." или "✅ Относительно безопасный состав..."` 
          }]
        }],
        generationConfig: { 
          temperature: 0.7, 
          maxOutputTokens: 500,
          topK: 40,
          topP: 0.95
        }
      };

      const response = await fetchWithProxyFallback(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (error) {
      console.error('Gemini analytics error:', error);
      return null;
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
      .replace(/[^\w\s\u0401\u0451\u0410-\u042f\u0430-\u044f()\-.,+×÷=%\n]/g, '')
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

  function saveToComparison() {
    if (!lastAnalysis) return;
    let compare = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
    const item = { ...lastAnalysis, timestamp: Date.now(), id: Date.now() };
    compare.push(item);
    if (compare.length > 5) compare = compare.slice(-5);
    localStorage.setItem(COMPARE_KEY, JSON.stringify(compare));
    alert('✅ Добавлено в сравнение!');
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

  // 📄 Generate PDF Report with jsPDF
  async function generatePDFReport() {
    if (!lastAnalysis || typeof jspdf === 'undefined') {
      alert('⚠️ Нет данных для отчета или PDF библиотека не загружена');
      return;
    }
    
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LabelSpy - Анализ продукта', 20, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Дата: ${new Date().toLocaleDateString('ru')}`, 20, 30);
      
      let y = 45;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Общая оценка', 20, y);
      y += 8;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const verdictText = `${lastAnalysis.verdict.title}: ${lastAnalysis.verdict.body}`;
      const splitVerdict = doc.splitTextToSize(verdictText, 170);
      doc.text(splitVerdict, 20, y);
      y += splitVerdict.length * 6 + 10;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('E-коды', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (lastAnalysis.ecodes && lastAnalysis.ecodes.length > 0) {
        doc.text(lastAnalysis.ecodes.join(', '), 20, y);
        y += 8;
      } else {
        doc.text('Не обнаружено', 20, y);
        y += 8;
      }
      
      y += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Аллергены', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (lastAnalysis.allergens && lastAnalysis.allergens.length > 0) {
        doc.text(lastAnalysis.allergens.join(', '), 20, y);
        y += 8;
      } else {
        doc.text('Не обнаружено', 20, y);
        y += 8;
      }
      
      doc.save(`labelspy-report-${Date.now()}.pdf`);
      alert('✅ PDF отчет сохранен!');
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('❌ Ошибка генерации PDF');
    }
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
      
      setOcrProgress(0.3, '🔍 Распознавание Tesseract...');
      const { data: { text } } = await Tesseract.recognize(processed, ocrLang.value || 'rus+eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(0.3 + m.progress * 0.6, `🔍 ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      setOcrProgress(0.95, '✨ Очистка...');
      textInput.value = cleanOCRText(text);
      
      setOcrProgress(1, '✅ Готово!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 800);
    } catch (e) {
      console.error('OCR Error:', e);
      ocrStatus.classList.add('hidden');
      alert('❌ Ошибка OCR: ' + e.message);
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
        setOcrProgress(0.2, '🤖 Отправка в Gemini...');
        const text = await recognizeWithGemini(lastImageDataUrl);
        
        setOcrProgress(0.9, '✨ Обработка...');
        textInput.value = cleanOCRText(text);
        
        setOcrProgress(1, '✅ Gemini распознал идеально!');
        setTimeout(() => ocrStatus.classList.add('hidden'), 800);
      } catch (e) {
        console.error('Gemini Error:', e);
        ocrStatus.classList.add('hidden');
        alert(`❌ Ошибка Gemini: ${e.message}\n\n🔄 Попробуйте еще раз или используйте Tesseract.`);
      }
      btnGeminiOcr.disabled = false;
    });
  }

  btnUseSample.addEventListener('click', () => {
    textInput.value = 'Состав: вода, пшеничная мука, сахар, масло сливочное, яйца, молоко, соль, E621, E330, разрыхлитель (E500ii). Пищевая ценность на 100г: сахар 15г, жиры 8г, соль 0.5г.';
  });

  btnAnalyze.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
      alert('⚠️ Введите или распознайте состав!');
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

    const eItems = ecodes.map(code => eDb[code] || { name_ru: code, attention: 'неизвестно' });
    const verdict = computeOverallVerdict(eItems, allergens_found, hidden_sugars, { sugar: tl_sugar, fat: tl_fat, salt: tl_salt });
    setVerdict(verdict);

    lastAnalysis = { ecodes, allergens: allergens_found, sugars: hidden_sugars, nutrients, composition: compositionBlock, verdict, timestamp: Date.now() };

    metricEcodes.textContent = ecodes.length;
    metricAllergens.textContent = allergens_found.length;
    metricSugars.textContent = hidden_sugars.length;
    compositionSnippet.textContent = compositionBlock || '—';

    // 🧠 AI Analysis
    if (compositionBlock) {
      const aiAnalysis = $('#aiAnalysis');
      if (aiAnalysis) {
        aiAnalysis.classList.remove('hidden');
        aiAnalysis.innerHTML = '<div class="pill pill-yellow">⏳ Анализ Gemini AI...</div>';
        
        try {
          const analysis = await analyzeWithGemini(compositionBlock);
          if (analysis) {
            aiAnalysis.innerHTML = `<div class="ai-insight"><strong>🤖 AI-анализ (Gemini):</strong> ${analysis}</div>`;
            lastAnalysis.aiAnalysis = analysis;
          } else {
            aiAnalysis.classList.add('hidden');
          }
        } catch (e) {
          aiAnalysis.classList.add('hidden');
        }
      }
    }

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
        const attention = item.attention || 'неизвестно';
        const notes = item.notes_ru || '—';
        const cls = attention === 'высокий' ? 'badge-high' : (attention === 'средний' ? 'badge-mid' : 'badge-low');
        return `<tr><td class="mono">${code}</td><td>${name}</td><td><span class="badge ${cls}">${attention}</span></td><td>${notes}</td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>Код</th><th>Название</th><th>Оценка</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    if (btnGeminiOcr) btnGeminiOcr.disabled = true;
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

  console.log('🔍 LabelSpy 3.0 loaded! Multi-proxy, enhanced Gemini, PDF reports');
  console.log('🌐 Active CORS Proxy:', CORS_PROXIES[currentProxyIndex]);
})();
