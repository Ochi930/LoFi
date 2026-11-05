const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'lofi-dev-secret-change-me';

const sign = u => jwt.sign({ id: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '7d' });
const read = req => { try { return jwt.verify((req.headers.authorization || '').slice(7), SECRET); } catch { return null; } };

// Middleware: optional (guests allowed), auth (must be signed in), staff (security only)
const optional = (req, res, next) => { req.user = read(req); next(); };
const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' }); };
const staff = (req, res, next) => req.user.role === 'security' ? next() : res.status(403).json({ error: 'Security staff only.' });

router.post('/register', (req, res) => {
  const { name, email, password, confirm } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 6) return res.status(400).json({ error: 'Fill in every field with a valid email. Password needs 6 or more characters.' });
  if (password !== confirm) return res.status(400).json({ error: 'The two passwords do not match.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return res.status(400).json({ error: 'That email already has an account. Try signing in.' });
  const id = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10)).lastInsertRowid;
  const user = { id, name: name.trim(), role: 'student' };
  res.json({ token: sign(user), user });
});

router.post('/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) return res.status(400).json({ error: 'Email or password is not right.' });
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: sign(user), user });
});

module.exports = { router, auth, staff, optional };
