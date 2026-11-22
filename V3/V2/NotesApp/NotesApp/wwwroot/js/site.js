(function () {
    let allNotes = [];
    let allTasks = [];
    let quillEditor;
    let currentNoteAttachments = [];
    let isViewingTrash = false;
    let currentCalendarDate = new Date();

    document.addEventListener("DOMContentLoaded", () => {
        try {
            const SizeStyle = Quill.import('attributors/style/size');
            SizeStyle.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '30px', '32px'];
            Quill.register(SizeStyle, true);
        } catch (e) {
            console.error("Ошибка при инициализации Quill:", e);
        }

        quillEditor = new Quill('#editor-container', {
            modules: {
                toolbar: {
                    container: '#toolbar-container',
                    handlers: {
                        image: selectLocalImage
                    }
                }
            },
            theme: 'snow'
        });

        document.getElementById('btn-font-increase')?.addEventListener('click', () => changeFontSize(2));
        document.getElementById('btn-font-decrease')?.addEventListener('click', () => changeFontSize(-2));

        const imgBtn = document.querySelector('#toolbar-container .ql-image');
        if (imgBtn) {
            imgBtn.addEventListener('click', selectLocalImage);
        }

        loadNotes();
    });

    // Загрузка картинки внутрь текста заметки
    function selectLocalImage() {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Ошибка загрузки картинки');

                const result = await response.json();
                const range = quillEditor.getSelection(true);
                quillEditor.insertEmbed(range.index, 'image', result.url);
            } catch (error) {
                console.error(error);
                alert("Не удалось загрузить изображение в текст.");
            }
        };
    }

    function changeFontSize(step) {
        const range = quillEditor.getSelection();
        const index = range ? range.index : 0;
        const length = range ? range.length : quillEditor.getLength();
        const currentFormat = quillEditor.getFormat(index, length);
        let currentSize = currentFormat.size;

        if (!currentSize) {
            const rootStyles = window.getComputedStyle(document.getElementById('editor-container'));
            currentSize = rootStyles.fontSize;
        }

        let newSize = parseInt(currentSize) + step;
        if (newSize < 10) newSize = 10;
        if (newSize > 32) newSize = 32;

        if (range && range.length > 0) {
            quillEditor.format('size', `${newSize}px`);
        } else {
            quillEditor.formatText(index, length, 'size', `${newSize}px`);
        }
    }

    // Переключение вкладок
    const tabLinks = document.querySelectorAll('#mainNavigation [data-tab]');
    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const sectionId = link.getAttribute('data-tab');

            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const sections = document.querySelectorAll('.tab-content-section');
            sections.forEach(section => section.classList.add('d-none'));

            const activeSection = document.getElementById(sectionId);
            if (activeSection) {
                activeSection.classList.remove('d-none');
            }

            if (sectionId === 'tasksSection') {
                loadTasks();
            }
        });
    });

    // Переключение между обычными заметками и корзиной
    function toggleTrashView() {
        isViewingTrash = !isViewingTrash;
        const title = document.getElementById('notesSectionTitle');
        const btn = document.getElementById('trashBtn');

        if (isViewingTrash) {
            if (title) title.innerText = "КОРЗИНА";
            if (btn) btn.innerText = "📝 К заметкам";
            loadTrashNotes();
        } else {
            if (title) title.innerText = "ЗАМЕТОЧКИ";
            if (btn) btn.innerText = "🗑️ Корзина";
            loadNotes();
        }
    }

    // Загрузка активных заметок
    async function loadNotes() {
        isViewingTrash = false;
        const container = document.getElementById('noteContainer');
        if (!container) return;

        try {
            const response = await fetch('/api/notes');
            if (!response.ok) throw new Error('Ошибка данных');

            allNotes = await response.json();
            renderNotesList(allNotes);
        } catch (error) {
            console.error(error);
        }
    }

    // Загрузка заметок из корзины
    async function loadTrashNotes() {
        const container = document.getElementById('noteContainer');
        if (!container) return;

        try {
            const response = await fetch('/api/notes/trash');
            if (!response.ok) throw new Error('Ошибка данных');

            const trashNotes = await response.json();
            if (trashNotes.length === 0) {
                container.innerHTML = '<div class="text-center text-muted">Корзина пуста.</div>';
                return;
            }

            container.innerHTML = trashNotes.map(note => `
                <div class="card mb-3 shadow-sm border-danger">
                    <div class="card-body">
                        <h5 class="card-title fw-bold">${escapeHtml(note.title)}</h5>
                        <div class="card-text ql-editor p-0 mb-2" style="max-height: 150px; overflow: auto;">${note.content}</div>
                        <div class="d-flex justify-content-between mt-3">
                            <button class="btn btn-sm btn-success" onclick="restoreNote(${note.id})">♻️ Восстановить</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="permanentDeleteNote(${note.id})">❌ Удалить навсегда</button>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error(error);
        }
    }

    // Отрисовка списка заметок с тегами и закрепом
    function renderNotesList(notes) {
        const container = document.getElementById('noteContainer');
        if (!container) return;

        if (notes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted">Заметок пока нет.</div>';
            return;
        }

        container.innerHTML = notes.map(note => {
            let attachmentsHtml = '';
            if (note.attachments && note.attachments.length > 0) {
                attachmentsHtml = `<div class="mt-3 pt-2 border-top"><strong>Вложения:</strong><ul class="mb-0 ps-3">` +
                    note.attachments.map(att => `<li><a href="${att.filePath}" target="_blank">${escapeHtml(att.fileName)}</a></li>`).join('') +
                    `</ul></div>`;
            }

            let tagHtml = note.category ? `<span class="badge bg-info text-dark me-2">#${escapeHtml(note.category)}</span>` : '';
            let pinClass = note.isPinned ? 'border-primary bg-light' : '';

            return `
                <div class="card mb-3 shadow-sm note-card ${pinClass}" style="cursor: pointer;" id="note-${note.id}" onclick="openEditModal(${note.id}, event)">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                ${tagHtml}
                                <h5 class="card-title fw-bold mb-0 d-inline-block" style="word-break: break-word;">${escapeHtml(note.title)}</h5>
                            </div>
                            <div>
                                <button onclick="event.stopPropagation(); togglePin(${note.id})" class="btn btn-sm btn-outline-warning border-0" title="Закрепить">📌</button>
                                <button onclick="event.stopPropagation(); deleteNote(${note.id})" class="btn btn-sm btn-outline-danger border-0 font-weight-bold" title="В корзину">&times;</button>
                            </div>
                        </div>
                        <small class="text-muted d-block mb-2">${note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}</small>
                        <div class="card-text ql-editor p-0 mb-2" style="max-height: 250px; overflow: auto;">${note.content}</div>
                        ${attachmentsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    function openCreateModal() {
        document.getElementById('noteId').value = "";
        document.getElementById('noteTitle').value = "";
        document.getElementById('noteCategory').value = "";
        document.getElementById('noteIsPinned').checked = false;
        if (quillEditor) quillEditor.setText('');

        const attachInput = document.getElementById('noteAttachments');
        if (attachInput) attachInput.value = '';

        currentNoteAttachments = [];
        renderExistingAttachments();

        document.getElementById('addNoteModalLabel').innerText = "Новая заметка";
        new bootstrap.Modal(document.getElementById('addNoteModal')).show();
    }

    function openEditModal(id, event) {
        const note = allNotes.find(n => n.id === id);
        if (!note) return;

        document.getElementById('noteId').value = note.id;
        document.getElementById('noteTitle').value = note.title;
        document.getElementById('noteCategory').value = note.category || "";
        document.getElementById('noteIsPinned').checked = note.isPinned;
        if (quillEditor) quillEditor.root.innerHTML = note.content;

        const attachInput = document.getElementById('noteAttachments');
        if (attachInput) attachInput.value = '';

        currentNoteAttachments = note.attachments ? [...note.attachments] : [];
        renderExistingAttachments();

        document.getElementById('addNoteModalLabel').innerText = "Редактировать заметку";
        new bootstrap.Modal(document.getElementById('addNoteModal')).show();
    }

    function renderExistingAttachments() {
        const container = document.getElementById('existingAttachmentsContainer');
        if (!container) return;

        if (!currentNoteAttachments || currentNoteAttachments.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '<strong>Существующие файлы:</strong><div class="d-flex flex-wrap gap-2 mt-1">' +
            currentNoteAttachments.map(att => `
                <span class="badge bg-secondary d-flex align-items-center gap-1 p-2">
                    <a href="${att.filePath}" target="_blank" class="text-white text-decoration-none">${escapeHtml(att.fileName)}</a>
                    <button type="button" class="btn-close btn-close-white btn-sm" onclick="event.stopPropagation(); removeAttachment(${att.id})" title="Удалить файл"></button>
                </span>
            `).join('') + '</div>';
    }

    function removeAttachment(attId) {
        currentNoteAttachments = currentNoteAttachments.filter(a => a.id !== attId);
        renderExistingAttachments();
    }

    async function saveNote() {
        const id = document.getElementById('noteId').value;
        const title = document.getElementById('noteTitle').value.trim();
        const category = document.getElementById('noteCategory').value.trim();
        const isPinned = document.getElementById('noteIsPinned').checked;
        if (!quillEditor) return;
        const content = quillEditor.root.innerHTML;
        const fileInput = document.getElementById('noteAttachments');

        if (!title || !quillEditor.getText().trim()) {
            alert("Заполните заголовок и текст!");
            return;
        }

        const formData = new FormData();
        formData.append("title", title);
        formData.append("content", content);
        formData.append("category", category);
        formData.append("isPinned", isPinned);

        if (id !== "") {
            currentNoteAttachments.forEach(att => {
                formData.append("keepAttachmentIds", att.id);
            });
        }

        if (fileInput && fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append("attachments", fileInput.files[i]);
            }
        }

        try {
            const url = id ? `/api/notes/${id}` : '/api/notes';
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                body: formData
            });

            if (!response.ok) throw new Error('Ошибка при сохранении');

            bootstrap.Modal.getInstance(document.getElementById('addNoteModal'))?.hide();
            loadNotes();
        } catch (error) {
            alert("Ошибка при сохранении заметки");
            console.error(error);
        }
    }

    async function deleteNote(id) {
        if (!confirm("Вы уверены, что хотите перенести эту заметку в корзину?")) return;
        try {
            await fetch(`/api/notes/${id}`, { method: 'DELETE' });
            loadNotes();
        } catch (error) { alert("Не удалось удалить заметку"); }
    }

    async function togglePin(id) {
        try {
            await fetch(`/api/notes/${id}/pin`, { method: 'PATCH' });
            loadNotes();
        } catch (error) { console.error(error); }
    }

    async function restoreNote(id) {
        try {
            await fetch(`/api/notes/${id}/restore`, { method: 'PATCH' });
            loadTrashNotes();
        } catch (error) { console.error(error); }
    }

    async function permanentDeleteNote(id) {
        if (!confirm("Удалить заметку навсегда? Это действие необратимо.")) return;
        try {
            await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' });
            loadTrashNotes();
        } catch (error) { console.error(error); }
    }

    // === ЗАДАЧИ ===
    async function loadTasks() {
        const container = document.getElementById('taskContainer');
        if (!container) return;
        try {
            const response = await fetch('/api/tasks');
            if (!response.ok) throw new Error();
            allTasks = await response.json();
            renderCalendar();
            if (allTasks.length === 0) {
                container.innerHTML = '<div class="text-center text-muted">Задач пока нет.</div>';
                return;
            }
            container.innerHTML = allTasks.map(task => {
                const badges = ['<span class="badge bg-secondary">Низкий</span>', '<span class="badge bg-info text-dark">Средний</span>', '<span class="badge bg-danger">Высокий</span>'];
                return `
                <div class="card mb-2 shadow-sm ${task.isCompleted ? 'bg-light border-success' : ''}">
                    <div class="card-body d-flex align-items-center justify-content-between p-3">
                        <div class="d-flex align-items-center" style="flex:1; min-width:0;">
                            <input type="checkbox" class="form-check-input me-3" style="width:20px;height:20px;cursor:pointer;" ${task.isCompleted ? 'checked' : ''} onclick="toggleTaskStatus(${task.id})"/>
                            <div style="cursor:pointer;" onclick="openEditTaskModal(${task.id})">
                                <h6 class="mb-1 fw-bold ${task.isCompleted ? 'text-decoration-line-through text-muted' : ''}">${escapeHtml(task.title)}</h6>
                                <p class="small text-muted mb-0">${escapeHtml(task.description || 'Нет описания')}</p>
                            </div>
                        </div>
                        <div class="text-end ms-3">
                            <div class="mb-1">${badges[task.priority]}</div>                      
                            <small class="text-muted d-block mb-1">📅 ${task.dueDate ? new Date(task.dueDate).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}</small>
                            <button onclick="deleteTask(${task.id})" class="btn btn-sm btn-link text-danger p-0 border-0">Удалить</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (e) { console.error(e); }
    }

    function openCreateTaskModal() {
        document.getElementById('taskId').value = "";
        document.getElementById('taskTitle').value = "";
        document.getElementById('taskDescription').value = "";
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
        document.getElementById('taskDueDate').value = tomorrow.toISOString().slice(0, 16);
        document.getElementById('taskPriority').value = "1";
        new bootstrap.Modal(document.getElementById('addTaskModal')).show();
    }

    function openEditTaskModal(id) {
        const task = allTasks.find(t => t.id === id);
        if (!task) return;
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || "";
        if (task.dueDate) document.getElementById('taskDueDate').value = task.dueDate.slice(0, 16);
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('addTaskModalLabel').innerText = "Редактировать задачу";
        new bootstrap.Modal(document.getElementById('addTaskModal')).show();
    }

    async function saveTask() {
        const id = document.getElementById('taskId').value;
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDescription').value.trim();
        const dueDate = document.getElementById('taskDueDate').value;
        const priority = parseInt(document.getElementById('taskPriority').value);
        if (!title) { alert("Укажите заголовок!"); return; }
        const taskData = { id: id ? parseInt(id) : 0, title: title, description: description, dueDate: dueDate, priority: priority, isCompleted: id ? allTasks.find(t => t.id === parseInt(id))?.isCompleted || false : false };

        try {
            await fetch(id ? `/api/tasks/${id}` : '/api/tasks', {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            bootstrap.Modal.getInstance(document.getElementById('addTaskModal'))?.hide();
            loadTasks();
        } catch (e) { alert("Ошибка сохранения задачи"); }
    }

    async function toggleTaskStatus(id) {
        try {
            await fetch(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
            loadTasks();
        } catch (e) { console.error(e); }
    }

    async function deleteTask(id) {
        if (!confirm("Вы уверены, что хотите удалить эту задачу?")) return;
        try {
            await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            loadTasks();
        } catch (e) { console.error(e); }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function changeMonth(direction)
    {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
        renderCalendar();
    }

    function renderCalendar()
    {
        const titleEl = document.getElementById('calendarMonthTitle');
        const gridEl = document.getElementById('calendarGrid');
        if (!gridEl || !titleEl) return;

        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
        titleEl.innerText = `${monthNames[month]} ${year}`;

        const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        let html = `<table class="calendar-table">
    <thead>
        <tr>
            <th>Пн</th><th>Вт</th><th>Ср</th><th>Чт</th><th>Пт</th><th>Сб</th><th>Вс</th>
        </tr>
    </thead>
    <tbody>
    <tr>`;

        let dayCount = 1;
        let nextMonthDay = 1;
        let totalCells = 42;

        for (let i = 0; i < totalCells; i++) {
            if (i % 7 === 0 && i !== 0) {
                html += `</tr><tr>`;
            }

            if (i < firstDayIndex) {
                let prevDay = daysInPrevMonth - firstDayIndex + i + 1;
                html += `<td class="calendar-other-month"><div class="calendar-day-number">${prevDay}</div></td>`;
            } else if (dayCount <= daysInMonth) {
                let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`;

                let dayTasks = allTasks.filter(t => t.dueDate && t.dueDate.startsWith(dateStr));

                let tasksHtml = dayTasks.map(t => {
                    let completedCalss = t.isCompleted ? 'completed' : '';
                    let checkIcon = t.isCompleted ? '✅ ' : '';
                    return `
            <div class="calendar-task-item priority-${t.priority}" onclick="openEditTaskModal(${t.id})" title="${escapeHtml(t.title)}">
                ${escapeHtml(t.title)}
            </div>
            `;
                }).join('');

                html += `<td>
            <div class="calendar-day-number">${dayCount}</div>
            <div style="max-height: 70px; overflow-y: auto;">${tasksHtml}</div>
        </td>`;
                dayCount++;
            } else {
                html += `<td class="calendar-other-month"><div class="calendar-day-number">${nextMonthDay}</div></td>`;
                nextMonthDay++;
            }
        }

        html += `</tr></tbody></table>`;
        gridEl.innerHTML = html;
    }

    // Глобальные биндинги
    window.openCreateTaskModal = openCreateTaskModal;
    window.openEditTaskModal = openEditTaskModal;
    window.saveTask = saveTask;
    window.toggleTaskStatus = toggleTaskStatus;
    window.deleteTask = deleteTask;
    window.openCreateModal = openCreateModal;
    window.openEditModal = openEditModal;
    window.saveNote = saveNote;
    window.deleteNote = deleteNote;
    window.removeAttachment = removeAttachment;
    window.togglePin = togglePin;
    window.toggleTrashView = toggleTrashView;
    window.restoreNote = restoreNote;
    window.permanentDeleteNote = permanentDeleteNote;
    window.changeMonth = changeMonth;
})();