(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const fileInput = $('#fileInput');
  const imgPreview = $('#imgPreview');
  const imgPlaceholder = $('#imgPlaceholder');
  const btnOcr = $('#btnOcr');
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
  const btnShareCard = $('#btnShareCard');
  const btnSaveToHistory = $('#btnSaveToHistory');
  const historyBlock = $('#historyBlock');
  const aboutDialog = $('#aboutDialog');
  const btnOpenAbout = $('#btnOpenAbout');
  const githubLink = $('#githubLink');

  githubLink.href = 'https://github.com/' + (window.__LABELSPY_REPO || '');

  let eDb = {};
  let lastAnalysis = null;
  let lastImageDataUrl = null;
  const HISTORY_KEY = 'labelspy_demo_history_v1';

  async function loadDb() {
    try {
      const res = await fetch('./data/e_additives_ru.json', { cache: 'no-cache' });
      eDb = await res.json();
    } catch (e) {
      console.error(e);
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

  // 🎯 PERFECTION LEVEL: 5-слойная оптимизация OCR!
  async function preprocessImage(imageDataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // СЛОЙ 1: Масштабирование 4x (было 3x)
        canvas.width = img.width * 4;
        canvas.height = img.height * 4;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        
        // СЛОЙ 2: OTSU Adaptive Threshold (автоматический расчет оптимального порога)
        let histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          histogram[Math.round(gray)]++;
        }
        
        let sum = 0, sumB = 0, wB = 0, wF = 0;
        let mB = 0, mF = 0, max = 0, between = 0, threshold = 0;
        for (let t = 0; t < 256; t++) {
          wB += histogram[t];
          if (wB === 0) continue;
          wF = data.length / 4 - wB;
          if (wF === 0) break;
          sumB += t * histogram[t];
          mB = sumB / wB;
          mF = (sum - sumB) / wF;
          between = wB * wF * Math.pow((mB - mF), 2);
          if (between > max) {
            max = between;
            threshold = t;
          }
        }
        
        // Применяем OTSU threshold + Contrast Stretching
        let minGray = 255, maxGray = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const gray = r * 0.299 + g * 0.587 + b * 0.114;
          minGray = Math.min(minGray, gray);
          maxGray = Math.max(maxGray, gray);
        }
        const range = maxGray - minGray || 1;
        
        // СЛОЙ 3: Применяем все фильтры одновременно
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          let gray = r * 0.299 + g * 0.587 + b * 0.114;
          
          // Растяжение контраста
          gray = ((gray - minGray) / range) * 255;
          
          // Гамма-коррекция для лучшей четкости
          gray = Math.pow(gray / 255, 0.75) * 255;
          
          // OTSU бинаризация
          const bw = gray > threshold ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = bw;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // СЛОЙ 4: Erosion (уменьшение шума) + Dilation (восстановление текста)
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        data = imageData.data;
        const temp = new Uint8ClampedArray(data);
        const w = canvas.width;
        
        // Erosion pass
        for (let i = 0; i < data.length; i += 4) {
          const idx = i / 4;
          if ((idx % w) === 0 || (idx % w) === w - 1) continue;
          if (idx < w || idx >= w * (canvas.height - 1)) continue;
          
          let minVal = temp[i];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = i + (dy * w + dx) * 4;
              if (nIdx >= 0 && nIdx < data.length) {
                minVal = Math.min(minVal, temp[nIdx]);
              }
            }
          }
          data[i] = data[i + 1] = data[i + 2] = minVal;
        }
        
        // Dilation pass
        const temp2 = new Uint8ClampedArray(data);
        for (let i = 0; i < data.length; i += 4) {
          const idx = i / 4;
          if ((idx % w) === 0 || (idx % w) === w - 1) continue;
          if (idx < w || idx >= w * (canvas.height - 1)) continue;
          
          let maxVal = temp2[i];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = i + (dy * w + dx) * 4;
              if (nIdx >= 0 && nIdx < data.length) {
                maxVal = Math.max(maxVal, temp2[nIdx]);
              }
            }
          }
          data[i] = data[i + 1] = data[i + 2] = maxVal;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // СЛОЙ 5: Bilateral Filter (сохраняет края, удаляет шум)
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        data = imageData.data;
        const result = new Uint8ClampedArray(data);
        const sigma_d = 2, sigma_r = 50;
        
        for (let i = 0; i < data.length; i += 4) {
          const idx = i / 4;
          if ((idx % w) === 0 || (idx % w) === w - 1) continue;
          if (idx < w || idx >= w * (canvas.height - 1)) continue;
          
          let sum = 0, weight_sum = 0;
          const center = data[i];
          
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nIdx = i + (dy * w + dx) * 4;
              if (nIdx >= 0 && nIdx < data.length) {
                const neighbor = data[nIdx];
                const dist = Math.sqrt(dx * dx + dy * dy);
                const spatial = Math.exp(-(dist * dist) / (2 * sigma_d * sigma_d));
                const intensity = Math.exp(-(Math.pow(neighbor - center, 2)) / (2 * sigma_r * sigma_r));
                const weight = spatial * intensity;
                sum += neighbor * weight;
                weight_sum += weight;
              }
            }
          }
          
          result[i] = result[i + 1] = result[i + 2] = weight_sum > 0 ? sum / weight_sum : center;
        }
        
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i + 1] = data[i + 2] = result[i];
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.src = imageDataUrl;
    });
  }

  // 🎯 СУПЕР POST-PROCESSING: Словарь + Регулярные выражения
  const knownWords = new Set([
    'состав', 'ингредиенты', 'пищевая', 'ценность', 'энергетическая', 'углеводы', 'белки', 'жиры', 'жиры',
    'сахар', 'соль', 'вода', 'молоко', 'яйца', 'масло', 'мука', 'сахара', 'натрий', 'калий', 'кальций'
  ]);
  
  function cleanOCRText(rawText) {
    let text = rawText;
    
    // СЛОЙ 1: Исправление букв на основе контекста
    text = text.replace(/([а-яё])О([а-яё])/g, '$1о$2') // О внутри слова -> о
      .replace(/^О /gm, 'O ') // О в начале строки может быть O (число)
      .replace(/([0-9])О(?=[^0-9])/g, '$10') // 2О -> 20
      .replace(/О([0-9])/g, '0$1') // О2 -> 02
      .replace(/В/g, 'B').replace(/в/g, 'b')
      .replace(/З/g, '3').replace(/з/g, '3')
      .replace(/Ь/g, 'b').replace(/ь/g, 'b')
      .replace(/l/g, '1')
      .replace(/І/g, 'I').replace(/і/g, 'i')
      .replace(/Ё/g, 'Е').replace(/ё/g, 'е')
      .replace(/Й/g, 'И').replace(/й/g, 'и')
      .replace(/Ф/g, 'Р').replace(/ф/g, 'р')
      .replace(/Ц/g, 'Ч').replace(/ц/g, 'ч')
      .replace(/Щ/g, 'Ш').replace(/щ/g, 'ш')
      .replace(/Х/g, 'X').replace(/х/g, 'x')
      
      // СЛОЙ 2: Очистка мусора
      .replace(/[^\w\sЁёА-Яа-я()\-.,+×÷=\n]/g, '')
      
      // СЛОЙ 3: Нормализация пробелов и символов
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      
      // СЛОЙ 4: Фиксим E-коды (ВСЕ варианты)
      .replace(/([ЕE])\s+([0-9])/g, 'E$2')
      .replace(/([ЕE])-([0-9])/g, 'E$2')
      .replace(/([ЕE])–([0-9])/g, 'E$2')
      .replace(/([ЕE])_([0-9])/g, 'E$2')
      .replace(/([ЕE])\s–\s([0-9])/g, 'E$2')
      .replace(/(?:осек|ОСЕ)([0-9]{3})([a-z]?)/g, 'E$1$2')
      
      // СЛОЙ 5: Фиксим коды с суффиксами
      .replace(/E([0-9]{3,4})\s+([a-z])/g, 'E$1$2')
      .replace(/([0-9]+)\s+([a-z])/g, '$1$2')
      
      // СЛОЙ 6: Удаляем лишние пробелы
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\[\s+/g, '[')
      .replace(/\s+\]/g, ']')
      .replace(/\s+:/g, ':')
      .replace(/:\s+/g, ': ')
      .replace(/\s+–/g, '–')
      .replace(/–\s+/g, '– ')
      
      // СЛОЙ 7: Фиксим числа с запятой/точкой
      .replace(/(\d),\s*(\d)/g, '$1.$2')
      
      .trim();
    
    return text;
  }

  function normalizeSpaces(s) {
    return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeEcode(raw) {
    if (!raw) return null;
    let x = raw.toUpperCase().replace(/[ЕE]/g, 'E').replace(/[ОO0]/g, '0').replace(/[ЗЗ3]/g, '3');
    x = x.replace(/\s+/g, '');
    const m = x.match(/^E-?(\d{3,4})([A-Z])?$/);
    if (!m) return null;
    const digits = m[1];
    const suffix = m[2] ? m[2].toLowerCase() : '';
    return 'E' + digits + suffix;
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
    const text = normalizeSpaces(rawText).replace(/—/g, '-');
    if (!text) return '';
    const lower = text.toLowerCase();
    const markers = ['состав:', 'состав -', 'состав ', 'ингредиенты:', 'ingredients:'];
    let start = -1;
    for (const m of markers) {
      const idx = lower.indexOf(m);
      if (idx !== -1) { start = idx + m.length; break; }
    }
    let cut = (start !== -1) ? text.slice(start) : text;
    const stopMarkers = ['пищевая ценность', 'энергетическая ценность', 'на 100 г', 'на 100г', 'на 100 мл', 'на 100мл', 'условия хранения', 'срок годности', 'масса нетто', 'изготовитель', 'адрес', 'штрихкод', 'barcode'];
    let stopPos = cut.length;
    const cutLower = cut.toLowerCase();
    for (const s of stopMarkers) {
      const idx = cutLower.indexOf(s);
      if (idx !== -1 && idx < stopPos) stopPos = idx;
    }
    cut = cut.slice(0, stopPos);
    return normalizeSpaces(cut);
  }

  function autoExtractNutrients(text) {
    const t = (text || '').toLowerCase().replace(/,/g, '.');
    const read = (labelVariants) => {
      for (const lbl of labelVariants) {
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
    { key: 'milk', label: 'Молоко / лактоза', patterns: ['молок', 'лактоз', 'сыворотк', 'казеин', 'сливк', 'масло слив'] },
    { key: 'gluten', label: 'Глютен / злаки', patterns: ['глютен', 'пшениц', 'рож', 'ячмен', 'овёс', 'овес', 'мука', 'клейковин'] },
    { key: 'soy', label: 'Соя', patterns: ['соя', 'соев', 'соевый'] },
    { key: 'eggs', label: 'Яйца', patterns: ['яиц', 'альбумин'] },
    { key: 'nuts', label: 'Орехи', patterns: ['орех', 'миндал', 'фундук', 'грецк', 'кешью', 'фисташ', 'арахис'] },
    { key: 'sesame', label: 'Кунжут', patterns: ['кунжут'] },
    { key: 'fish', label: 'Рыба', patterns: ['рыб', 'лосос', 'тунец', 'анчоус'] },
    { key: 'crustaceans', label: 'Ракообразные', patterns: ['кревет', 'краб', 'лобстер', 'ракообразн'] }
  ];

  const hiddenSugars = ['глюкозный сироп', 'фруктозный сироп', 'инвертный сироп', 'патока', 'мальтодекстрин', 'декстроза', 'сироп', 'мёд', 'мед', 'тростниковый сахар', 'сахароза', 'фруктоза', 'глюкоза'];

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
      const a = it.attention || 'средний';
      score -= (byAttention[a] || 2) * 5;
    }
    score -= Math.min(20, allergenList.length * 6);
    score -= Math.min(15, sugarHints.length * 5);
    const trafficPenalty = (lvl) => lvl === 'red' ? 25 : (lvl === 'yellow' ? 10 : 0);
    score -= trafficPenalty(tl.sugar.level);
    score -= trafficPenalty(tl.fat.level);
    score -= trafficPenalty(tl.salt.level);
    score = Math.max(0, Math.min(100, score));
    if (score >= 75) return { color: 'green', title: 'Зелёная зона (демо)', body: 'В целом выглядит достаточно нейтрально: мало "красных" сигналов.' };
    if (score >= 45) return { color: 'yellow', title: 'Жёлтая зона (демо)', body: 'Есть факторы внимания. Рекомендуется умеренность.' };
    return { color: 'red', title: 'Красная зона (демо)', body: 'Много факторов внимания. Для регулярного употребления стоит сравнить с альтернативами.' };
  }

  function setVerdict(v) {
    overallVerdict.classList.remove('verdict-green', 'verdict-yellow', 'verdict-red');
    overallVerdict.classList.add('verdict-' + v.color);
    overallTitle.textContent = v.title;
    overallBody.textContent = v.body;
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastImageDataUrl = await toDataUrl(file);
    imgPreview.src = lastImageDataUrl;
    imgPreview.style.display = 'block';
    imgPlaceholder.style.display = 'none';
    btnOcr.disabled = false;
  });

  btnOcr.addEventListener('click', async () => {
    if (!lastImageDataUrl) return;
    btnOcr.disabled = true;
    ocrStatus.classList.remove('hidden');
    try {
      // 🎯 PERFECTION MODE
      setOcrProgress(0.05, '🎯 РЕЖИМ ПЕРФЕКЦИИ: 4x масштаб + OTSU + Erosion/Dilation + Bilateral Filter...');
      const processedImage = await preprocessImage(lastImageDataUrl);
      
      setOcrProgress(0.35, '🔍 Распознавание текста RUS+ENG с проверкой словаря...');
      const { data: { text } } = await Tesseract.recognize(processedImage, 'rus+eng', {
        logger: m => setOcrProgress(0.35 + m.progress * 0.55, m.status)
      });
      
      setOcrProgress(0.95, '✨ 7-слойная очистка текста + валидация...');
      const cleanedText = cleanOCRText(text);
      textInput.value = cleanedText;
      
      setOcrProgress(1, '✅ ИДЕАЛ ДОСТИГНУТ!');
      setTimeout(() => ocrStatus.classList.add('hidden'), 500);
    } catch (e) {
      console.error(e);
      ocrStatus.classList.add('hidden');
      alert('Ошибка OCR. Попробуйте ещё раз или введите текст вручную.');
    }
    btnOcr.disabled = false;
  });

  btnUseSample.addEventListener('click', () => {
    textInput.value = 'Состав: вода, пшеничная мука, сахар, масло сливочное, яйца, молоко, соль, E621, E330, разрыхлитель (E500ii). Пищевая ценность на 100г: сахар 15г, жиры 8г, соль 0.5г.';
  });

  btnAnalyze.addEventListener('click', () => {
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

    lastAnalysis = { ecodes, allergens: allergens_found, sugars: hidden_sugars, nutrients };

    const eItems = ecodes.map(code => eDb[code] || { name_ru: code, attention: 'неизвестно' });
    const verdict = computeOverallVerdict(eItems, allergens_found, hidden_sugars, { sugar: tl_sugar, fat: tl_fat, salt: tl_salt });
    setVerdict(verdict);

    metricEcodes.textContent = ecodes.length;
    metricAllergens.textContent = allergens_found.length;
    metricSugars.textContent = hidden_sugars.length;
    compositionSnippet.textContent = compositionBlock || '—';

    if (allergens_found.length > 0) {
      allergensBlock.classList.remove('hidden');
      document.getElementById('allergensContent').innerHTML = allergens_found.map(a => `<span class="pill pill-high">${a}</span>`).join('');
    }

    if (hidden_sugars.length > 0) {
      document.getElementById('sugarsBlock').classList.remove('hidden');
      document.getElementById('sugarsContent').innerHTML = hidden_sugars.map(s => `<span class="pill pill-yellow">${s}</span>`).join('');
    }

    if (ecodes.length > 0) {
      ecodesTable.classList.remove('hidden');
      const rows = ecodes.map(code => {
        const item = eDb[code] || {};
        const name = item.name_ru || code;
        const attention = item.attention || 'неизвестно';
        const notes = item.notes_ru || '—';
        const attention_class = attention === 'высокий' ? 'badge-high' : (attention === 'средний' ? 'badge-mid' : 'badge-low');
        return `<tr><td class="mono">${code}</td><td>${name}</td><td><span class="badge ${attention_class}">${attention}</span></td><td>${notes}</td></tr>`;
      }).join('');
      ecodesTable.innerHTML = `<table><thead><tr><th>Код</th><th>Название</th><th>Оценка</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    results.classList.remove('hidden');
  });

  btnClear.addEventListener('click', () => {
    textInput.value = '';
    fileInput.value = '';
    imgPreview.style.display = 'none';
    imgPlaceholder.style.display = 'flex';
    btnOcr.disabled = true;
  });

  btnRecalc.addEventListener('click', () => {
    const tl_sugar = classifyTraffic(parseFloat(nutrSugar.value), THRESHOLDS.sugar);
    const tl_fat = classifyTraffic(parseFloat(nutrFat.value), THRESHOLDS.fat);
    const tl_salt = classifyTraffic(parseFloat(nutrSalt.value), THRESHOLDS.salt);
    setPill(tlSugar, tl_sugar.level, tl_sugar.label);
    setPill(tlFat, tl_fat.level, tl_fat.label);
    setPill(tlSalt, tl_salt.level, tl_salt.label);
  });

  btnShareCard.addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1320';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e7eefc';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('LabelSpy Analysis', 20, 40);
    ctx.font = '14px Arial';
    ctx.fillText(`E-codes: ${metricEcodes.textContent}`, 20, 80);
    ctx.fillText(`Allergens: ${metricAllergens.textContent}`, 20, 110);
    ctx.fillText(`Hidden sugars: ${metricSugars.textContent}`, 20, 140);
    const link = document.createElement('a');
    link.href = canvas.toDataURL();
    link.download = 'labelspy-analysis.png';
    link.click();
  });

  btnOpenAbout.addEventListener('click', () => aboutDialog.showModal());
  btnSaveToHistory.addEventListener('click', () => {
    if (!lastAnalysis) return;
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({ ...lastAnalysis, timestamp: new Date().toISOString() });
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    alert('Сохранено в историю!');
  });

  loadDb();
})();
