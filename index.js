'use strict'

// requires
require("date-utils");
const express = require("express");
const sqlite3 = require('sqlite3').verbose();

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

const app = express();

// DB初期化
const initDb = new sqlite3.Database('punchData');
initDb.serialize(function () {
    initDb.run('CREATE TABLE punch (user_id TEXT, punch_date_time TEXT, is_in integer)');
});
initDb.close();

app.get("/show/all", function (req, res) {
    const db = new sqlite3.Database('punchData');
    db.serialize(function () {
        db.all('SELECT * FROM punch', (err, rows) => {
            res.json(rows)
        })
    });
    db.close();
});

app.get("/show/:userId", function (req, res) {
    const db = new sqlite3.Database('punchData');
    db.serialize(function () {
        const query = `SELECT * FROM punch WHERE user_id = ${req.params}`
        db.all(query, (err, rows) => {
            res.json(rows)
        })
    });
    db.close();
});

/**
 * 出勤
 */
app.post("/in", function (req, respond) {
    punching(0, req.body.user_id);
});

/**
 * 退勤
 */
app.post("/out", function (request, respond) {
    punching(1, req.body.user_id);
});

/**
 * 打刻処理
 * @param {Number} isIn 0:出勤 1:退勤
 * @param {String} userId ユーザID
 */
const punching = (isIn, userId) =>{
    const db = new sqlite3.Database('punchData');
    const now = new Date().toFormat("YYYY/MM/DD HH24:MI:SS") 
    // insert
    db.serialize(function () {
        const stmt = db.prepare('INSERT INTO punch VALUES (?)');
        stmt.run(`${userId}, ${now}, ${isIn}`, (err) => {
            console.log(err)
        })
        stmt.finalize();
    });

    db.close();
}

//listenで待ち受け状態にする
app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`)
