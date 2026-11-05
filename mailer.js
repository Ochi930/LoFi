// db.alert(userId, subject, text): in-app notification + email. Without SMTP settings the email is logged and stored in the `emails` table.
const nodemailer = require('nodemailer');
const db = require('./db');
const smtp = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;

db.alert = async (userId, subject, text) => {
  db.notify(userId, text);
  const u = db.prepare('SELECT email,name FROM users WHERE id=?').get(userId);
  if (!u) return;
  const body = `Hi ${u.name.split(' ')[0]},\n\n${text}\n\nOpen LoFi to see more.\n\nThe LoFi team`;
  let sent = 0;
  if (smtp) {
    try { await smtp.sendMail({ from: process.env.MAIL_FROM || 'LoFi <no-reply@lofi.school>', to: u.email, subject, text: body }); sent = 1; }
    catch (e) { console.error('Email failed:', e.message); }
  } else console.log(`[email not sent, SMTP not set up] to ${u.email}: ${subject}`);
  db.prepare('INSERT INTO emails(to_addr,subject,body,sent) VALUES(?,?,?,?)').run(u.email, subject, body, sent);
};
