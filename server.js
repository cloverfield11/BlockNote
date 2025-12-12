const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const shortid = require('shortid');
const database = require('./database');
const MobileDetect = require('mobile-detect');
const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3025;

// Инициализация Mistral AI
const mistralClient = new Mistral(process.env.MISTRAL_API_KEY);
const MISTRAL_MODEL = "mistral-large-2411";

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/view', express.static(path.join(__dirname, 'public')));

// Функция для определения мобильного устройства
function isMobile(req) {
  const md = new MobileDetect(req.headers['user-agent']);
  const isMobileDevice = md.mobile() !== null;
  const isTablet = md.tablet() !== null;

  // Считаем планшеты тоже мобильными устройствами
  return isMobileDevice || isTablet;
}

// Генерация случайного ID
function generateId() {
  return shortid.generate();
}

// API для прямой потоковой генерации в редактор
app.post('/api/ai-stream-direct', async (req, res) => {
  if (isMobile(req)) {
    return res.status(403).json({ error: 'Использование ИИ с мобильных устройств не разрешено' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Промпт слишком короткий' });
    }

    console.log(`🎯 Прямая генерация: "${prompt.substring(0, 100)}..."`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // Сначала отправляем системный промпт для получения заголовка и автора
      const response = await mistralClient.chat.complete({
        model: MISTRAL_MODEL,
        messages: [
          {
            role: "system",
            content: `ТЫ — ГЕНЕРАТОР СТАТЕЙ ДЛЯ РЕДАКТОРА BLOCKNOTE.
СОЗДАЙ СТАТЬЮ С ТАКОЙ СТРУКТУРОЙ:

1. 🏷️ ЗАГОЛОВОК: (один заголовок, краткий, цепляющий, креативный, без кавычек, 5-10 слов)
2. 👤 АВТОР: @MistralAI
3. 📝 СОДЕРЖАНИЕ: (HTML контент статьи)

ВЕРНИ ОТВЕТ В ФОРМАТЕ:
ЗАГОЛОВОК: [здесь заголовок]
АВТОР: @MistralAI
СОДЕРЖАНИЕ: [здесь HTML контент]

ПРАВИЛА ДЛЯ СОДЕРЖАНИЯ С УЧЁТОМ ФУНКЦИОНАЛА РЕДАКТОРА BLOCKNOTE:

1. 📌 ОСНОВНЫЕ ТЕГИ:
   - Абзацы: <p>...</p> (всегда оборачивай текст в параграфы)
   - Заголовки внутри статьи: <h2>...</h2> (для разделов), <h3>...</h3> (для подразделов)
   - НИКОГДА не используй <h1> внутри контента - это только для заголовка статьи

2. 🎨 ФОРМАТИРОВАНИЕ ТЕКСТА:
   - Жирный: <strong>...</strong> (НЕ <b>)
   - Курсив: <em>...</em> (НЕ <i>)
   - Подчеркнутый: <u>...</u> (поддерживается редактором)
   - Используй форматирование умеренно, для выделения ключевых моментов

3. 📊 СТРУКТУРИРОВАНИЕ:
   - Маркированные списки: <ul><li>пункт 1</li><li>пункт 2</li></ul>
   - Нумерованные списки: <ol><li>пункт 1</li><li>пункт 2</li></ol>
   - Цитаты: <blockquote>...</blockquote>
   - Горизонтальные линии: <hr> (для разделения разделов)

4. 🖼️ ИЗОБРАЖЕНИЯ (важный момент!):
   - Используй такой формат:
     <figure class="image-block">
       <img src="https://source.unsplash.com/random/800x600/?technology" alt="Описание изображения">
       <figcaption>Подпись к изображению</figcaption>
     </figure>
   - Для src можно использовать:
     * https://source.unsplash.com/random/800x600/?[тема]
     * https://via.placeholder.com/800x600.png?text=[текст]
     * https://picsum.photos/800/600?random=[номер]
   - Обязательно добавляй осмысленный alt и подпись в figcaption
   - Вставляй изображения после значимых абзацев, не чаще чем 1 на 3-4 абзаца

5. 🔗 ССЫЛКИ:
   - Формат: <a href="https://пример.com" target="_blank" rel="noopener noreferrer">Текст ссылки</a>
   - Всегда добавляй target="_blank" и rel="noopener noreferrer"
   - Текст ссылки должен быть описательным

6. 📋 ТАБЛИЦЫ:
   - Формат таблицы:
     <table>
       <tr>
         <th style="border:1px solid #e0e0e0;padding:8px">Заголовок 1</th>
         <th style="border:1px solid #e0e0e0;padding:8px">Заголовок 2</th>
       </tr>
       <tr>
         <td style="border:1px solid #e0e0e0;padding:8px">Данные 1</td>
         <td style="border:1px solid #e0e0e0;padding:8px">Данные 2</td>
       </tr>
     </table>
   - Используй style атрибуты для границ и отступов как в примере
   - Таблицы должны быть простыми и информативными

7. 📐 ВЫРАВНИВАНИЕ:
   - Можно использовать style="text-align:center" для <p>, <h2>, <h3>
   - Но не злоупотребляй - основной текст должен быть слева

8. ⚠️ СТРОГИЕ ЗАПРЕТЫ:
   - НИКОГДА не используй Markdown (**, ##, -, * и т.д.)
   - НИКОГДА не используй <div>, <span> (редактор их может удалить)
   - НИКОГДА не используй <br> для разделения абзацев (только <p>)
   - НИКОГДА не оборачивай весь ответ в <html>, <body>, <head>
   - НИКОГДА не используй стили кроме border, padding, text-align
   - НИКОГДА не используй JavaScript, CSS-классы кроме "image-block"

9. 🎯 СТИЛЬ НАПИСАНИЯ:
   - Пиши как профессиональный журналист/автор
   - Первый абзац должен быть цепляющим
   - Используй подзаголовки каждые 3-5 абзацев
   - Чередуй длинные и короткие предложения
   - Включай 1-2 списка (маркированных или нумерованных)
   - Включай 1-2 изображения если тема позволяет
   - Включай 1-2 ссылки на внешние источники
   - Включай хотя бы одну цитату если уместно

10. 📏 ОБЪЕМ:
    - Минимум 500 слов, максимум 1500 слов
    - 3-7 разделов с подзаголовками
    - 5-15 абзацев
    - 1-3 изображения
    - 1-2 списка
    - 0-1 таблицу

ПРИМЕР КОРРЕКТНОЙ СТАТЬИ:
ЗАГОЛОВОК: Будущее искусственного интеллекта в повседневной жизни
АВТОР: @MistralAI
СОДЕРЖАНИЕ:
<p>Искусственный интеллект уже перестал быть научной фантастикой...</p>
<h2>Трансформация бытовых устройств</h2>
<p>Современные умные дома...</p>
<figure class="image-block">
  <img src="https://source.unsplash.com/random/800x600/?smart-home" alt="Умный дом с ИИ">
  <figcaption>Умные дома становятся реальностью благодаря ИИ</figcaption>
</figure>
<p>Более того, <strong>голосовые помощники</strong>...</p>
<ul>
  <li>Автоматизация рутинных задач</li>
  <li>Персонализация окружения</li>
  <li>Энергоэффективность</li>
</ul>

ТЕМА: ${prompt}

ВАЖНО: Начни генерировать сразу после этого сообщения, без лишних комментариев.`
          },
          {
            role: "user",
            content: `Создай профессиональную, хорошо структурированную статью на тему: "${prompt}". 
Включи заголовки, списки, изображения, ссылки и форматирование согласно всем правилам выше.
Заголовок должен быть креативным и привлекающим внимание.`
          }
        ],
        temperature: 0.4,
        maxTokens: 2000
      });

      const fullResponse = response.choices[0].message.content;

      // Парсим ответ для извлечения заголовка, автора и содержания
      let title = '';
      let author = '';
      let content = '';

      // Регулярные выражения для поиска компонентов
      const titleMatch = fullResponse.match(/ЗАГОЛОВОК:\s*(.+?)(?=\n|$)/i);
      const authorMatch = fullResponse.match(/АВТОР:\s*(.+?)(?=\n|$)/i);
      const contentMatch = fullResponse.match(/СОДЕРЖАНИЕ:\s*([\s\S]*?)(?=$)/i);

      if (titleMatch) {
        title = titleMatch[1].trim();
        // Убираем возможные кавычки
        title = title.replace(/^["']|["']$/g, '');
      } else {
        // Если не нашли по формату, берем первую строку как заголовок
        const lines = fullResponse.split('\n');
        title = lines[0].replace(/^(#\s*)?/, '').trim();
      }

      if (authorMatch) {
        author = authorMatch[1].trim();
        // Убираем возможные кавычки
        author = author.replace(/^["']|["']$/g, '');
      } else {
        author = 'Mistral AI';
      }

      if (contentMatch) {
        content = contentMatch[1].trim();
      } else {
        // Если не нашли по формату, пытаемся извлечь контент после заголовка и автора
        const withoutTitle = fullResponse.replace(/ЗАГОЛОВОК:\s*.+?\n?/i, '');
        const withoutAuthor = withoutTitle.replace(/АВТОР:\s*.+?\n?/i, '');
        content = withoutAuthor.trim();
      }

      // Отправляем метаданные (заголовок и автора) отдельно
      const metadataEvent = {
        type: "metadata",
        title: title,
        author: author
      };
      res.write(`data: ${JSON.stringify(metadataEvent)}\n\n`);

      // Разбиваем контент на части для потоковой отправки
      const paragraphs = content.split(/(?<=<\/?[ph][1-6]?>|<\/?[ou]l>|<\/?blockquote>)/gi);

      // Отправляем начальный статус для контента
      res.write('data: {"type": "start", "total": ' + paragraphs.length + '}\n\n');

      // Отправляем каждый параграф с задержкой
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        if (!paragraph) continue;

        // Небольшая задержка для эффекта печати
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const data = {
          type: "chunk",
          content: paragraph,
          progress: Math.min(100, Math.floor((i + 1) / paragraphs.length * 100))
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      // Завершаем
      res.write('data: {"type": "complete", "message": "Готово"}\n\n');

    } catch (genError) {
      console.error('Ошибка генерации:', genError);
      res.write('data: {"type": "error", "message": "Ошибка генерации"}\n\n');
    }

    res.end();

  } catch (error) {
    console.error('Ошибка API:', error);
    res.write(`data: {"type": "error", "message": "${error.message}"}\n\n`);
    res.end();
  }
});

// Главная страница с редактором - показываем mobile-message для мобильных
app.get('/', (req, res) => {
  if (isMobile(req)) {
    console.log('Mobile device detected, serving mobile-message.html for /');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.join(__dirname, 'public', 'mobile-message.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница просмотра статьи - разрешена для всех
app.get('/:id', async (req, res) => {
  try {
    const article = await database.getArticle(req.params.id);
    if (article) {
      res.sendFile(path.join(__dirname, 'views', 'view.html'));
    } else {
      res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить статью - разрешено для всех
app.get('/api/article/:id', async (req, res) => {
  try {
    const article = await database.getArticle(req.params.id);
    if (article) {
      res.json(article);
    } else {
      res.status(404).json({ error: 'Article not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Создать новую статью - запрещено для мобильных
app.post('/api/article', async (req, res) => {
  // Проверяем, мобильное ли устройство
  if (isMobile(req)) {
    return res.status(403).json({
      error: 'Creating articles from mobile devices is not allowed. Please use a desktop computer.'
    });
  }

  try {
    const { title, content, author } = req.body;

    // Очистка HTML от опасных тегов
    const cleanContent = sanitizeHtml(content, {
      allowedTags: [
        ...sanitizeHtml.defaults.allowedTags,
        'img', 'h1', 'h2', 'h3', 'figure', 'figcaption', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code'
      ],
      allowedAttributes: {
        '*': ['class', 'style'],
        'a': ['href', 'name', 'target', 'rel'],
        'img': ['src', 'alt'],
        'figure': ['class'],
        'p': ['style'], // для text-align
        'h1': ['style'],
        'h2': ['style'],
        'h3': ['style']
      },
      // Защита от XSS
      parser: {
        lowerCaseAttributeNames: true
      }
    });

    const article = {
      id: generateId(),
      title: title || 'Без названия',
      content: cleanContent,
      author: author || 'Аноним',
      created_at: new Date().toISOString(),
      views: 0
    };

    const savedArticle = await database.createArticle(article);
    res.json(savedArticle);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// API: Обновить статью - запрещено для мобильных
app.put('/api/article/:id', async (req, res) => {
  // Проверяем, мобильное ли устройство
  if (isMobile(req)) {
    return res.status(403).json({
      error: 'Updating articles from mobile devices is not allowed. Please use a desktop computer.'
    });
  }

  try {
    const { title, content } = req.body;
    const articleId = req.params.id;

    const cleanContent = sanitizeHtml(content, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
      allowedAttributes: {
        'a': ['href', 'name', 'target'],
        'img': ['src', 'alt'],
        '*': ['class', 'style']
      }
    });

    const updated = await database.updateArticle(articleId, {
      title: title || 'Без названия',
      content: cleanContent,
      updated_at: new Date().toISOString()
    });

    if (updated) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Article not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// API: Увеличить счетчик просмотров - разрешено для всех
app.post('/api/article/:id/view', async (req, res) => {
  try {
    await database.incrementViews(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update views' });
  }
});

// API: Получить последние статьи - разрешено для всех
app.get('/api/articles/recent', async (req, res) => {
  try {
    const articles = await database.getRecentArticles();
    res.json(articles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить статьи с пагинацией и поиском - разрешено для всех
app.get('/api/articles', async (req, res) => {
  try {
    const { page = 1, limit = 12, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Получаем статьи с учетом поиска и пагинации
    const articles = await database.getArticlesWithPagination(
      search,
      limitNum,
      offset
    );

    // Получаем общее количество статей для пагинации
    const totalArticles = await database.getArticlesCount(search);

    res.json({
      articles,
      total: totalArticles,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalArticles / limitNum)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Страница со списком всех статей - показываем mobile-message для мобильных
app.get('/articles/all', (req, res) => {
  if (isMobile(req)) {
    console.log('Mobile device detected, serving mobile-message.html for /articles/all');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(path.join(__dirname, 'public', 'mobile-message.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'articles.html'));
});

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`BlockNote запущен на порту ${PORT}`);
  console.log(`Доступен по адресу: http://localhost:${PORT}`);

  // Инициализация базы данных
  await database.initialize();
});