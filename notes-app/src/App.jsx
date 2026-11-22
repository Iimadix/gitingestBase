import { useState, useEffect } from "react";
import "./App.css";

// Ключ, под которым заметки будут лежать в памяти браузера
const STORAGE_KEY = "my_notes_v3";

// Вспомогательная функция: превращает текущую дату в формат "11.11.2026 14:30"
function formatDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.
  ${pad(date.getMonth() + 1)}.
  ${date.getFullYear()} 
  ${pad(date.getHours())}:
  ${pad(date.getMinutes())}`;
}

function App() {
  // 1. СПИСОК ЗАМЕТОК: при запуске пытаемся достать старые заметки из памяти браузера
  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. СОСТОЯНИЯ ЭКРАНА РЕДАКТОРА
  const [isEditing, setIsEditing] = useState(false); // Открыт ли редактор?
  const [currentId, setCurrentId] = useState(null);  // ID открытой заметки (null = новая)
  const [title, setTitle] = useState("");            // Текст в поле заголовка
  const [text, setText] = useState("");              // Текст в поле самой заметки

  // 3. АВТОСОХРАНЕНИЕ: срабатывает каждый раз, когда меняется массив notes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  // Функция открытия редактора (если передали note — редактируем, если null — создаем)
  const openEditor = (note = null) => {
    setCurrentId(note ? note.id : null);
    setTitle(note ? note.title : "");
    setText(note ? note.text : "");
    setIsEditing(true);
  };

  // Функция сохранения заметки (кнопка ✓)
  const handleSave = () => {
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();

    // Если оба поля пустые — просто закрываем редактор без сохранения
    if (!trimmedTitle && !trimmedText) {
      setIsEditing(false);
      return;
    }

    const now = formatDate();

    if (currentId !== null) {
      // Обновляем существующую заметку: проходим по списку и заменяем нужную
      setNotes((prev) =>
        prev.map((note) =>
          note.id === currentId
            ? { ...note, title: trimmedTitle, text: trimmedText, date: now }
            : note
        )
      );
    } else {
      // Создаем новую заметку с уникальным ID (текущее время в миллисекундах)
      const newNote = {
        id: Date.now(),
        title: trimmedTitle,
        text: trimmedText,
        date: now,
      };
      // Добавляем новую заметку в самое начало списка
      setNotes((prev) => [newNote, ...prev]);
    }

    setIsEditing(false); // Возвращаемся к списку
  };

  // Функция удаления или отмены (кнопка ✕)
  const handleDeleteOrCancel = () => {
    if (currentId !== null) {
      // Оставляем в списке все заметки, КРОМЕ текущей
      setNotes((prev) => prev.filter((note) => note.id !== currentId));
    }
    setIsEditing(false);
  };

  // --- ЭКРАН 2: РЕДАКТОР ЗАМЕТКИ ---
  if (isEditing) {
    return (
      <div className="page">
        <div className="toolbar">
          <button onClick={handleDeleteOrCancel} className="icon-btn danger" title="Удалить или отменить">
            ✕
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Введите заголовок ..."
          />
          <button onClick={handleSave} className="icon-btn success" title="Сохранить">
            ✓
          </button>
        </div>

        <div className="editor-container">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите текст заметки..."
            autoFocus
          />
        </div>
      </div>
    );
  }

  // --- ЭКРАН 1: ГЛАВНЫЙ СПИСОК ЗАМЕТОК ---
  return (
    <div id="main-page" className="page">
      <h1>Мои Заметки</h1>

      <div className="notes-list">
        {notes.length === 0 && (
          <p className="empty-hint">Заметок пока нет. Нажмите «+», чтобы создать первую.</p>
        )}

        {notes.map((note) => (
          <div
            key={note.id}
            className="note-card"
            onClick={() => openEditor(note)}
          >
            <h3>{note.title || "Без заголовка"}</h3>
            <p>{note.text}</p>
            <small>{note.date}</small>
          </div>
        ))}
      </div>

      <button onClick={() => openEditor(null)} className="fab" title="Новая заметка">
        +
      </button>
    </div>
  );
}

export default App;
