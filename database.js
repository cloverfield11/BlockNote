const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'articles.db');
    this.db = null;
  }

  // Инициализация базы данных
  initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Ошибка подключения к базе данных:', err);
          reject(err);
        } else {
          console.log('Подключено к SQLite базе данных');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  // Создание таблиц
  createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          author TEXT DEFAULT 'Аноним',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME,
          views INTEGER DEFAULT 0
        )
      `;

      this.db.run(sql, (err) => {
        if (err) {
          console.error('Ошибка создания таблицы:', err);
          reject(err);
        } else {
          console.log('Таблица articles создана/проверена');
          resolve();
        }
      });
    });
  }

  // Создание статьи
  createArticle(article) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO articles (id, title, content, author, created_at, views)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const params = [
        article.id,
        article.title,
        article.content,
        article.author,
        article.created_at,
        article.views || 0
      ];

      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ ...article, rowid: this.lastID });
        }
      });
    });
  }

  // Получение статьи по ID
  getArticle(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM articles WHERE id = ?';

      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Обновление статьи
  updateArticle(id, updates) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE articles 
        SET title = ?, content = ?, updated_at = ?
        WHERE id = ?
      `;

      const params = [
        updates.title,
        updates.content,
        updates.updated_at,
        id
      ];

      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  // Увеличение счетчика просмотров
  incrementViews(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE articles SET views = views + 1 WHERE id = ?';

      this.db.run(sql, [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  // Получение последних статей
  getRecentArticles(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, title, author, created_at, views 
        FROM articles 
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  getArticlesWithPagination(search = '', limit = 12, offset = 0) {
    return new Promise((resolve, reject) => {
      let sql;
      let params;

      if (search) {
        sql = `
        SELECT id, title, author, created_at, views, 
               substr(content, 1, 200) as excerpt
        FROM articles 
        WHERE title LIKE ? OR content LIKE ? OR author LIKE ?
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm, searchTerm, limit, offset];
      } else {
        sql = `
        SELECT id, title, author, created_at, views, 
               substr(content, 1, 200) as excerpt
        FROM articles 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
        params = [limit, offset];
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Получение общего количества статей (с учетом поиска)
  getArticlesCount(search = '') {
    return new Promise((resolve, reject) => {
      let sql;
      let params;

      if (search) {
        sql = `
        SELECT COUNT(*) as count 
        FROM articles 
        WHERE title LIKE ? OR content LIKE ? OR author LIKE ?
      `;
        const searchTerm = `%${search}%`;
        params = [searchTerm, searchTerm, searchTerm];
      } else {
        sql = 'SELECT COUNT(*) as count FROM articles';
        params = [];
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }
}

module.exports = new Database();