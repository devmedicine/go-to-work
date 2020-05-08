'use strict'

// requires
const moment = require('moment');
moment.locale('ja');
const fs = require('fs')
const express = require("express");
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

// Constants
const PORT = 8080;
const LUNCH_BREAK = 1;

// express settings
const app = express();
app.use(bodyParser.json())
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// DB初期化
if (!fs.existsSync('punchData')) {
    const initDb = new sqlite3.Database('punchData');
    initDb.serialize(function () {
        initDb.run('CREATE TABLE punch (user_id TEXT, punch_date TEXT, punch_time TEXT, is_in integer, primary key(user_id, punch_date, is_in))');
    });
    initDb.close();
}

app.get('/', function (req, response) {
    response.render('index', {});
})

/**
 * 記録データ全て出力
 */
app.get("/show/all", function (req, res) {
    const db = new sqlite3.Database('punchData');
    db.serialize(function () {
        db.all('SELECT * FROM punch', (err, rows) => {
            res.json(rows)
        })
    });
    db.close();
});

/**
 * 勤務時間描画(棒グラフ)
 */
app.get("/charts/bar/:userId", function (req, res) {
    const db = new sqlite3.Database('punchData');
    db.serialize(function () {
        const query = `SELECT * FROM punch WHERE user_id = '${req.params.userId}'`
        db.all(query, (err, rows) => {
            const days = getDaysInThisMonth();
            const retouchedRows = retouchPunchDataToBar(days, rows);
            res.render('bar', { days, rows: retouchedRows, userId: req.params.userId });
        })
    });
    db.close();
});

/**
 * 出退勤時間描画(テーブル)
 */
app.get("/charts/table/:userId", function (req, res) {
    const db = new sqlite3.Database('punchData');
    db.serialize(function () {
        const query = `SELECT * FROM punch WHERE user_id = '${req.params.userId}'`
        db.all(query, (err, rows) => {
            const days = getDaysInThisMonth();
            const tableObjects = retouchPunchDataToTable(days, rows);
            let tableElement = "";
            tableObjects.forEach(t => {
                tableElement += `<tr><th scope="row">${t.day}</th><td>${t.in}</td><td>${t.out}</td><td>${t.diff}</td></tr>`
            })
            res.render('table', { elem: tableElement });
        })
    });
    db.close();
});

/**
 * 出勤
 */
app.post("/in", (req, res) => {
	console.log(req.body);
    punching(0, req.body.user_name, req.body.timestamp);
    res.send('success!');
});

/**
 * 退勤
 */
app.post("/out", function (req, res) {
    console.log(req.body);
    punching(1, req.body.user_name, req.body.timestamp);
    res.send('success!');
});

/**
 * 打刻処理
 * @param {Number} isIn 0:出勤 1:退勤
 * @param {String} userId ユーザID
 * @param {unix} timestamp タイムスタンプ
 */
const punching = (isIn, userId, timestamp) => {
    const db = new sqlite3.Database('punchData');
    const nowDate = timestamp ? moment(timestamp).utcOffset('+0900').format("YYYY/MM/DD") : moment().utcOffset('+0900').format("YYYY/MM/DD");
    const nowTime = timestamp ? moment(timestamp).utcOffset('+0900').format("HH:mm:ss") : moment().utcOffset('+0900').format("HH:mm:ss");
    // insert
    db.serialize(function () {
        const stmt = db.prepare('INSERT INTO punch VALUES (?, ?, ?, ?) ON CONFLICT(user_id, punch_date, is_in) do UPDATE SET punch_time = ?');
        stmt.run(userId, nowDate, nowTime, isIn, nowTime)
        stmt.finalize();
    });

    db.close();
}

/**
 * 出退勤時間差の配列を返す
 * @param {*} days 
 * @param {*} rows 
 */
const retouchPunchDataToBar = (days, rows) => {
    let result = [];
    if (rows.length <= 0) {
        return result;
    }

    days.forEach(day => {
        const sameDays = rows.filter(row => row.punch_date === day);
        // 退勤まで登録されている日付
        if (sameDays && sameDays[1]) {
            const diff = hoursDiff(sameDays, true);
            result.push(diff);
        } else {
            result.push(0);
        }
    });

    return result;
}

/**
 * 出退勤時刻確認用オブジェクトを返す
 * @param {*} days 
 * @param {*} rows 
 */
const retouchPunchDataToTable = (days, rows) => {
    let result = [];
    if (rows.length <= 0) {
        return result;
    }

    days.forEach(d => {
        const sameDays = rows.filter(row => row.punch_date === d);
        // 曜日付きにする
        const day = moment(d, 'YYYY-MM-DD').format('YYYY/MM/DD (ddd)')
        // 退勤まで登録されている日付
        if (sameDays && sameDays[1]) {
            // 差を求める
            const diff = hoursDiff(sameDays, true);
            result.push({
                day,
                "in": sameDays[0].is_in == 0 ? `${sameDays[0].punch_time}` : `${sameDays[1].punch_time}`,
                "out": sameDays[0].is_in == 1 ? `${sameDays[0].punch_time}` : `${sameDays[1].punch_time}`,
                diff,
            });
        } else {
            result.push({
                day,
                "in": "",
                "out": "",
                "diff": 0,
            });
        }
    });

    return result;
}

/**
 * 時間差を求める
 * @param {object} records punchテーブルデータ
 * @param {boolean} isMinusLunchBreak 昼休憩をマイナスするか
 */
const hoursDiff = (records, isMinusLunchBreak) => {
    const format = 'YYYY-MM-DD HH:mm:ss';
    const s = records[0].is_in == 0 ? `${records[0].punch_date} ${records[0].punch_time}` : `${records[1].punch_date} ${records[1].punch_time}`;
    const e = records[0].is_in == 1 ? `${records[0].punch_date} ${records[0].punch_time}` : `${records[1].punch_date} ${records[1].punch_time}`;
    const d = moment(e, format).diff(moment(s, format)) / (60 * 60 * 1000);

    if(isMinusLunchBreak){
        const diff = d > 4 ? d - LUNCH_BREAK : d;
        return diff;
    }

    return d;
}

/**
 * 当月の日付を配列にして返す
 * @return {Array<string>} 当月日付の配列
 */
const getDaysInThisMonth = () => {
    let result = [];
    const s = moment().startOf('month');
    const e = moment().endOf('month');

    while (s.unix() <= e.unix()) {
        result.push(s.format('YYYY/MM/DD'));
        s.add(1, 'days');
    }

    return result;
}

//listenで待ち受け状態にする
app.listen(PORT, () => {
    console.log(`Running on http://localhost:${PORT}`)
});
