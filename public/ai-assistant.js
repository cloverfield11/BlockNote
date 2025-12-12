// AI Integration for BlockNote - Direct toolbar integration
class AIIntegration {
    constructor() {
        this.editor = document.getElementById('editor');
        this.aiToolbar = document.getElementById('ai-toolbar');
        this.aiFloatingBtn = document.getElementById('ai-floating-btn');
        this.aiPromptInput = document.getElementById('ai-prompt-input');
        this.aiSendBtn = document.getElementById('ai-send-btn');
        this.aiStopBtn = document.getElementById('ai-stop-btn');
        this.aiCloseBtn = document.getElementById('ai-close-btn');

        // Проверяем, что элементы существуют
        if (!this.aiToolbar || !this.aiFloatingBtn) {
            console.error('AI элементы не найдены в DOM');
            return;
        }

        this.aiStatus = document.getElementById('ai-status');
        this.aiStatusText = this.aiStatus ? this.aiStatus.querySelector('.ai-status-text') : null;
        this.aiProgress = document.getElementById('ai-progress');
        this.aiProgressBar = this.aiProgress ? this.aiProgress.querySelector('.ai-progress-bar') : null;
        this.aiProgressText = this.aiProgress ? this.aiProgress.querySelector('.ai-progress-text') : null;

        this.isGenerating = false;
        this.streamController = null;
        this.currentInsertionPoint = null;
        this.currentContent = '';
        this.isToolbarVisible = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.loadSettings();

        // Добавляем кнопку ИИ в плавающую панель
        setTimeout(() => this.addAIButtonToFloatingToolbar(), 500);
    }

    setupEventListeners() {
        // Плавающая кнопка открытия ИИ
        this.aiFloatingBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleToolbar();
        });

        // Кнопка отправки промпта
        this.aiSendBtn?.addEventListener('click', () => this.generateContent());

        // Кнопка остановки генерации
        this.aiStopBtn?.addEventListener('click', () => this.stopGeneration());

        // Кнопка закрытия тулбокса
        this.aiCloseBtn?.addEventListener('click', () => this.hideToolbar());

        // Ввод промпта по Enter
        this.aiPromptInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.generateContent();
            }
        });

        // Закрытие тулбокса при клике вне его
        document.addEventListener('click', (e) => {
            if (this.isToolbarVisible &&
                this.aiToolbar &&
                !this.aiToolbar.contains(e.target) &&
                !this.aiFloatingBtn?.contains(e.target)) {
                this.hideToolbar();
            }
        });

        // Сохранение позиции курсора перед генерацией
        this.editor?.addEventListener('click', () => {
            this.saveCursorPosition();
        });

        this.editor?.addEventListener('keydown', () => {
            this.saveCursorPosition();
        });
    }

    setupKeyboardShortcuts() {
        // Ctrl+I для открытия ИИ тулбокса
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                this.toggleToolbar();
            }

            // Esc для закрытия
            if (e.key === 'Escape' && this.isToolbarVisible) {
                this.hideToolbar();
            }
        });
    }

    loadSettings() {
        // Загружаем последний промпт из localStorage
        if (this.aiPromptInput) {
            const lastPrompt = localStorage.getItem('ai_last_prompt');
            if (lastPrompt) {
                this.aiPromptInput.value = lastPrompt;
            }
        }
    }

    saveSettings() {
        if (this.aiPromptInput) {
            localStorage.setItem('ai_last_prompt', this.aiPromptInput.value);
        }
    }

    toggleToolbar() {
        if (this.isToolbarVisible) {
            this.hideToolbar();
        } else {
            this.showToolbar();
        }
    }

    showToolbar() {
        if (!this.aiToolbar) return;

        this.aiToolbar.style.display = 'block';
        this.aiFloatingBtn?.classList.add('ai-active');
        this.isToolbarVisible = true;

        // Сохраняем позицию курсора
        this.saveCursorPosition();

        // Фокус на поле ввода
        setTimeout(() => {
            this.aiPromptInput?.focus();
            this.aiPromptInput?.select();
        }, 100);

        this.showStatus('Готов к работе', 'info');
    }

    hideToolbar() {
        if (!this.aiToolbar) return;

        this.aiToolbar.style.display = 'none';
        this.aiFloatingBtn?.classList.remove('ai-active');
        this.isToolbarVisible = false;
        this.saveSettings();
    }

    saveCursorPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && this.editor) {
            const range = selection.getRangeAt(0);
            if (this.editor.contains(range.startContainer)) {
                this.currentInsertionPoint = range.cloneRange();
            }
        }
    }

    async generateContent() {
        const prompt = this.aiPromptInput?.value.trim();

        if (!prompt) {
            this.showStatus('Введите промпт для генерации', 'warning');
            this.aiPromptInput?.focus();
            return;
        }

        if (this.isGenerating) {
            this.showStatus('Генерация уже идет...', 'warning');
            return;
        }

        // Начинаем генерацию
        this.isGenerating = true;
        this.currentContent = '';

        // Сохраняем позицию вставки
        if (!this.currentInsertionPoint) {
            this.saveCursorPosition();
        }

        // Обновляем UI
        if (this.aiSendBtn) {
            this.aiSendBtn.disabled = true;
            this.aiSendBtn.style.display = 'none';
        }

        if (this.aiStopBtn) {
            this.aiStopBtn.style.display = 'flex';
        }

        if (this.aiProgress) {
            this.aiProgress.style.display = 'flex';
        }

        this.showStatus('🧠 Генерирую контент...', 'generating');
        this.updateProgress(0);

        // Добавляем индикатор печати в редактор
        this.showTypingIndicator();

        try {
            // Отправляем запрос на генерацию
            const response = await fetch('/api/ai-stream-direct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            this.streamController = {
                reader: reader,
                abortController: new AbortController()
            };

            let buffer = '';
            let totalLength = 0;
            let chunkCount = 0;
            let metadataReceived = false;

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    this.completeGeneration();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);

                        if (!dataStr.trim()) continue;

                        try {
                            const data = JSON.parse(dataStr);

                            switch (data.type) {
                                case 'metadata':
                                    // Обрабатываем метаданные (заголовок и автор)
                                    if (data.title) {
                                        const titleInput = document.getElementById('title');
                                        if (titleInput) {
                                            titleInput.value = data.title;
                                        }
                                    }

                                    if (data.author) {
                                        const authorInput = document.getElementById('author');
                                        if (authorInput) {
                                            authorInput.value = data.author;
                                        }
                                    }

                                    metadataReceived = true;
                                    this.showStatus('🎯 Заголовок и автор получены, генерирую контент...', 'generating');
                                    break;

                                case 'chunk':
                                    this.appendToEditor(data.content);
                                    totalLength += data.content.length;
                                    chunkCount++;

                                    // Обновляем прогресс
                                    if (data.progress) {
                                        this.updateProgress(data.progress);
                                    } else {
                                        const estimatedProgress = Math.min(95, Math.floor((chunkCount * 50) / 2000 * 100));
                                        this.updateProgress(estimatedProgress);
                                    }
                                    break;

                                case 'start':
                                    if (!metadataReceived) {
                                        this.showStatus('📝 Начинаю писать статью...', 'generating');
                                    }
                                    break;

                                case 'complete':
                                    this.completeGeneration();
                                    return;

                                case 'error':
                                    throw new Error(data.message);
                            }
                        } catch (e) {
                            console.error('Ошибка парсинга:', e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Ошибка генерации:', error);
            this.showStatus(`Ошибка: ${error.message}`, 'error');
            this.resetUI();
            this.hideTypingIndicator();
        }
    }

    getCursorPositionInfo() {
        if (!this.currentInsertionPoint) return null;

        try {
            // Создаем маркер для позиции вставки
            const marker = document.createElement('span');
            marker.id = 'ai-insertion-marker';
            marker.style.cssText = 'display:none;';

            this.currentInsertionPoint.insertNode(marker);
            const markerPosition = this.editor.innerHTML.indexOf(marker.outerHTML);
            marker.remove();

            return {
                position: markerPosition,
                textBefore: this.getTextBeforeCursor(100),
                textAfter: this.getTextAfterCursor(100)
            };
        } catch (e) {
            console.error('Ошибка получения позиции курсора:', e);
            return null;
        }
    }

    getTextBeforeCursor(chars) {
        if (!this.currentInsertionPoint || !this.editor) return '';

        try {
            const range = this.currentInsertionPoint.cloneRange();
            range.collapse(true);

            const tempDiv = document.createElement('div');
            const clonedRange = range.cloneRange();

            // Устанавливаем начало от начала редактора
            clonedRange.setStart(this.editor, 0);
            tempDiv.appendChild(clonedRange.cloneContents());

            const text = tempDiv.textContent || '';
            return text.slice(-chars);
        } catch (e) {
            return '';
        }
    }

    getTextAfterCursor(chars) {
        if (!this.currentInsertionPoint || !this.editor) return '';

        try {
            const range = this.currentInsertionPoint.cloneRange();
            range.collapse(true);

            const tempDiv = document.createElement('div');
            const clonedRange = range.cloneRange();

            // Устанавливаем конец до конца редактора
            clonedRange.setEnd(this.editor, this.getEditorNodeCount());
            tempDiv.appendChild(clonedRange.cloneContents());

            const text = tempDiv.textContent || '';
            return text.slice(0, chars);
        } catch (e) {
            return '';
        }
    }

    getEditorNodeCount() {
        if (!this.editor) return 0;
        let count = 0;
        let node = this.editor.firstChild;
        while (node) {
            count++;
            node = node.nextSibling;
        }
        return count;
    }

    appendToEditor(content) {
        if (!this.editor) return;

        // Если это первая часть контента, создаем временный элемент
        if (this.currentContent === '') {
            this.createInsertionMarker();
        }

        this.currentContent += content;

        // Вставляем контент в редактор
        const marker = document.getElementById('ai-insertion-marker');

        if (marker && marker.parentNode) {
            // Создаем временный div для парсинга HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.sanitizeHTML(content);

            // Вставляем каждый узел перед маркером
            while (tempDiv.firstChild) {
                marker.parentNode.insertBefore(tempDiv.firstChild, marker);
            }

            // Прокручиваем к новому контенту
            setTimeout(() => {
                marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        } else {
            // Если маркер не найден, вставляем в конец
            const range = document.createRange();
            range.selectNodeContents(this.editor);
            range.collapse(false);

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.sanitizeHTML(content);

            while (tempDiv.firstChild) {
                range.insertNode(tempDiv.firstChild);
                range.setStartAfter(range.endContainer);
                range.collapse(true);
            }

            // Устанавливаем курсор в конец
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }

        // Обновляем счетчик символов
        if (typeof updateCharCount === 'function') {
            updateCharCount();
        }
    }

    sanitizeHTML(html) {
        // Базовая очистка HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Разрешаем только безопасные теги
        const allowedTags = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'blockquote', 'code', 'pre'];
        const allowedAttributes = ['href', 'target', 'rel', 'src', 'alt'];

        const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
        let node;
        const nodesToRemove = [];

        while (node = walker.nextNode()) {
            // Удаляем неразрешенные теги
            if (!allowedTags.includes(node.tagName.toLowerCase())) {
                nodesToRemove.push(node);
                continue;
            }

            // Удаляем неразрешенные атрибуты
            const attrs = Array.from(node.attributes);
            attrs.forEach(attr => {
                if (!allowedAttributes.includes(attr.name.toLowerCase())) {
                    node.removeAttribute(attr.name);
                }
            });

            // Безопасность ссылок
            if (node.tagName === 'A' && node.href) {
                if (!node.href.startsWith('http') && !node.href.startsWith('#')) {
                    node.removeAttribute('href');
                } else {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer');
                }
            }
        }

        // Удаляем неразрешенные теги
        nodesToRemove.forEach(node => {
            const parent = node.parentNode;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
        });

        return temp.innerHTML;
    }

    createInsertionMarker() {
        if (!this.editor) return;

        // Удаляем старый маркер, если есть
        const oldMarker = document.getElementById('ai-insertion-marker');
        if (oldMarker) oldMarker.remove();

        // Создаем новый маркер
        const marker = document.createElement('span');
        marker.id = 'ai-insertion-marker';
        marker.style.cssText = `
            border-left: 2px solid #4CAF50;
            margin: 0 2px;
            height: 1em;
            display: inline-block;
            vertical-align: middle;
            animation: blink 1s infinite;
        `;

        // Вставляем маркер в сохраненную позицию
        if (this.currentInsertionPoint) {
            try {
                this.currentInsertionPoint.insertNode(marker);
            } catch (e) {
                // Если не удалось, вставляем в конец
                this.editor.appendChild(marker);
            }
        } else {
            // Если позиции нет, вставляем в конец
            this.editor.appendChild(marker);
        }
    }

    removeInsertionMarker() {
        const marker = document.getElementById('ai-insertion-marker');
        if (marker && marker.parentNode) {
            marker.remove();
        }
    }

    showTypingIndicator() {
        if (!this.editor || !this.editor.parentNode) return;

        this.hideTypingIndicator();

        const indicator = document.createElement('div');
        indicator.className = 'ai-typing-indicator';
        indicator.innerHTML = `
            <span>ИИ печатает...</span>
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        `;

        this.editor.parentNode.appendChild(indicator);
        this.editor.classList.add('ai-active');
    }

    hideTypingIndicator() {
        if (!this.editor || !this.editor.parentNode) return;

        const indicator = this.editor.parentNode.querySelector('.ai-typing-indicator');
        if (indicator) {
            indicator.remove();
        }
        this.editor.classList.remove('ai-active');
    }

    updateProgress(percentage) {
        if (!this.aiProgressBar || !this.aiProgressText) return;

        this.aiProgressBar.style.width = `${percentage}%`;
        this.aiProgressText.textContent = `${percentage}%`;

        // Обновляем статус
        if (percentage < 100) {
            this.showStatus(`Пишу: ${percentage}%`, 'generating');
        }
    }

    showStatus(message, type = 'info') {
        if (!this.aiStatusText) {
            console.log('AI Status:', message);
            return;
        }

        this.aiStatusText.textContent = message;

        // Сбрасываем цвета
        this.aiStatusText.style.color = '';
        if (this.aiStatus) {
            this.aiStatus.style.background = '';
        }

        switch (type) {
            case 'generating':
                this.aiStatusText.innerHTML = `⚡ ${message}`;
                this.aiStatusText.style.color = '#4CAF50';
                break;
            case 'success':
                this.aiStatusText.innerHTML = `✅ ${message}`;
                this.aiStatusText.style.color = '#4CAF50';
                break;
            case 'warning':
                this.aiStatusText.innerHTML = `⚠️ ${message}`;
                this.aiStatusText.style.color = '#FF9800';
                break;
            case 'error':
                this.aiStatusText.innerHTML = `❌ ${message}`;
                this.aiStatusText.style.color = '#f44336';
                break;
            default:
                this.aiStatusText.textContent = message;
        }
    }

    completeGeneration() {
        this.showStatus('Контент сгенерирован!', 'success');
        this.resetUI();
        this.hideTypingIndicator();
        this.removeInsertionMarker();

        // Показываем уведомление
        this.showNotification('ИИ завершил написание текста');

        // Сохраняем успешный промпт
        this.saveSettings();
    }

    stopGeneration() {
        if (this.streamController) {
            this.streamController.abortController.abort();
            if (this.streamController.reader) {
                this.streamController.reader.cancel();
            }
        }

        this.showStatus('Генерация остановлена', 'warning');
        this.resetUI();
        this.hideTypingIndicator();
        this.removeInsertionMarker();
    }

    resetUI() {
        this.isGenerating = false;
        this.streamController = null;

        if (this.aiSendBtn) {
            this.aiSendBtn.disabled = false;
            this.aiSendBtn.style.display = 'flex';
        }

        if (this.aiStopBtn) {
            this.aiStopBtn.style.display = 'none';
        }

        if (this.aiProgress) {
            this.aiProgress.style.display = 'none';
        }

        // Скрываем тулбокс через 3 секунды после успешной генерации
        if (this.aiStatusText && !this.aiStatusText.textContent.includes('Ошибка')) {
            setTimeout(() => {
                this.hideToolbar();
            }, 3000);
        }
    }

    showNotification(message) {
        // Проверяем, не существует ли уже уведомление
        const existing = document.querySelector('.ai-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'ai-notification';
        notification.innerHTML = `
            <div class="ai-notification-content">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #000;
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 4000;
            animation: slideInRight 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        document.body.appendChild(notification);

        // Добавляем анимацию
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .ai-notification-content {
                display: flex;
                align-items: center;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    addAIButtonToFloatingToolbar() {
        // Находим плавающую панель
        const floatingToolbar = document.querySelector('.floating-toolbar');
        if (!floatingToolbar) return;

        // Проверяем, не добавлена ли уже кнопка
        if (floatingToolbar.querySelector('[data-action="openAiToolbar"]')) {
            return;
        }

        // Создаем кнопку ИИ
        const aiButton = document.createElement('button');
        aiButton.setAttribute('data-action', 'openAiToolbar');
        aiButton.setAttribute('title', 'ИИ-ассистент (Ctrl+I)');
        aiButton.innerHTML = '<i class="fas fa-robot"></i>';

        // Добавляем обработчик
        aiButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showToolbar();
        });

        // Добавляем разделитель
        const separator = document.createElement('div');
        separator.style.cssText = `
            width: 1px;
            background: var(--color-gray);
            margin: 0 6px;
        `;

        // Вставляем в панель
        floatingToolbar.appendChild(separator);
        floatingToolbar.appendChild(aiButton);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Ждем загрузки DOM
    setTimeout(() => {
        try {
            const aiIntegration = new AIIntegration();
            window.aiIntegration = aiIntegration;
            console.log('✅ ИИ интеграция инициализирована');
        } catch (error) {
            console.error('❌ Ошибка инициализации ИИ:', error);
        }
    }, 100);
});