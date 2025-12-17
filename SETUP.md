# 🌐 LabelSpy 3.0 — Setup Guide (Yandex OCR)

## Проблема

Backend возвращает 405 или HTML → переменные окружения не установлены на Vercel.

## Решение за 3 шага

### Шаг 1️⃣ — Получи Yandex Cloud credentials

1. Зайди на https://console.cloud.yandex.com
2. Создай **Облако** → **Каталог** (если нет)
3. Перейди в **AI → Vision API**
4. Нажми **Включить** на Vision OCR
5. Перейди в **IAM** → **Сервисные аккаунты**
6. Создай service account (например `labelspy-ocr`)
7. Выдай ему роль `ai.vision.user`
8. Нажми на аккаунт → **Ключи** → **Создать API ключ**

**Получишь:**
- **API Key** (длинная строка с AQV...)
- **Folder ID** (скопируй из URL консоли или Settings)

### Шаг 2️⃣ — Установи переменные на Vercel

1. Зайди на https://vercel.com
2. Выбери проект `labelspy-demo`
3. `Settings → Environment Variables`
4. Добавь две переменные:
   - `YANDEX_API_KEY` = [твой API Key из Yandex Cloud]
   - `YANDEX_FOLDER_ID` = [твой Folder ID]

5. **ВАЖНО:** Нажми **Save** (не забудь!)
6. Нажми **Redeploy** в главном окне проекта

### Шаг 3️⃣ — Проверь работу

1. Открой сайт: https://labelspy-demo.vercel.app (или твой URL)
2. Загрузи фото этикетки
3. Нажми кнопку **"🌐 Распознать (Yandex OCR)"**
4. Открой **Console (F12)** и смотри логи:

```
🌐 [Frontend] Starting Yandex OCR...
📤 [Frontend] Sending to /api/ocr...
📥 [Frontend] Response status: 200
✅ [Frontend] OCR succeeded
```

## Ошибки и решения

### ❌ 405 Method Not Allowed
→ Backend не развёрнут  
**Решение:** Переделай На Vercel (Settings > Redeploy)

### ❌ "Unauthorized" / Invalid API Key
→ YANDEX_API_KEY неправильный или истёк  
**Решение:** Создай новый API Key в Yandex Cloud IAM

### ❌ "Forbidden" / Invalid Folder ID
→ YANDEX_FOLDER_ID неправильный  
**Решение:** Проверь Folder ID в Yandex Cloud Settings

### ❌ "body stream already read"
→ Ошибка в фронте (уже исправлена)  
**Решение:** Ctrl+Shift+R (обнови целиком)

## Тестирование локально (опционально)

```bash
# Установи Vercel CLI
npm i -g vercel

# Клонируй репо
git clone https://github.com/codgorbachev-art/labelspy-demo.git
cd labelspy-demo

# Создай .env.local
cat > .env.local << EOF
YANDEX_API_KEY=your_api_key_here
YANDEX_FOLDER_ID=your_folder_id_here
EOF

# Запусти локально
vercel dev

# Открой http://localhost:3000
```

## Архитектура

```
🌐 Frontend (Browser)
  └── POST /api/ocr
         └── 🌐 Backend (Vercel Serverless)
              └── POST https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText
                   └── 🔐 Yandex OCR (API Key in header)
```

## Основные файлы

- **`api/ocr.js`** → Backend endpoint (/api/ocr)
- **`app.js`** → Frontend logic
- **`index.html`** → UI
- **`vercel.json`** → Vercel config
- **`styles.css`** → Styling

## Что делать если всё работает?

✅ **Правильно распознавать этикетки!** 🚀

- Загружай реальные фотографии этикеток
- Анализатор найдет Е-коды, аллергены, сахара
- Скачивай PDF-отчеты

**Готово!**
