-- LoFi database schema (SQLite). The data itself lives in lofi.db, created from this file on first run.
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','security')));
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), type TEXT CHECK(type IN ('lost','found')),
  title TEXT NOT NULL, category TEXT NOT NULL, description TEXT, location TEXT, date TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','waitlisted','matched','returned')),
  has_photo INT DEFAULT 0, created DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, thread_id INT, sender_id INT, body TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY, user_id INT, item_id INT, note TEXT, remind_at TEXT, done INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INT, text TEXT, seen INT DEFAULT 0, created DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS emails(id INTEGER PRIMARY KEY, to_addr TEXT, subject TEXT, body TEXT, sent INT DEFAULT 0, created DATETIME DEFAULT CURRENT_TIMESTAMP);
