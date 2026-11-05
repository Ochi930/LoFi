const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), path = require('path');
const bcrypt = require('bcryptjs');
const db = new DatabaseSync('lofi.db');
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8'));
try { db.exec('ALTER TABLE items ADD COLUMN has_photo INT DEFAULT 0'); } catch {} // upgrades databases made by the first version

db.CATEGORIES = ['Electronics', 'Bags', 'Clothing', 'Books & Stationery', 'Keys & Cards', 'Bottles & Lunch', 'Other'];
db.notify = (userId, text) => db.prepare('INSERT INTO notifications(user_id,text) VALUES(?,?)').run(userId, text);

// First run: one security account + a few sample items
if (!db.prepare('SELECT 1 FROM users').get()) {
  const sec = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
    .run('School Security', 'security@lofi.school', bcrypt.hashSync('security123', 10), 'security').lastInsertRowid;
  const add = db.prepare('INSERT INTO items(user_id,type,title,category,description,location,date) VALUES(?,?,?,?,?,?,?)');
  const today = new Date().toISOString().slice(0, 10);
  add.run(sec, 'found', 'Black iPhone 13', 'Electronics', 'Cracked corner, blue case, lock screen photo of a dog.', 'Library, second floor', today);
  add.run(sec, 'found', 'Navy hoodie', 'Clothing', 'Size M, name tag partly torn.', 'Sports hall', today);
  add.run(sec, 'found', 'Silver key ring with 3 keys', 'Keys & Cards', 'Has a small moon charm.', 'Cafeteria', today);
  add.run(sec, 'found', 'Green water bottle', 'Bottles & Lunch', 'Steel, dented at the bottom.', 'Science lab', today);
  add.run(sec, 'found', 'Scientific calculator', 'Electronics', 'Casio, initials "A.K." on the back.', 'Room 12', today);
}
module.exports = db;
