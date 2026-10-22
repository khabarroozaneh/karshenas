/* اعتبارسنجی jalali.js — تاریخ شمسی در برابر تقویم ICU و تبدیل‌های دوطرفه
   اجرا: node wpjoo-expert-app/jalali.test.js (خروجی غیرصفر یعنی خطا) */
const J = require('./jalali.js');

function icu(date) {
  const p = date.toLocaleDateString('en-u-ca-persian-nu-latn').split('/');
  return { m: +p[0], d: +p[1], y: parseInt(p[2], 10) };
}

let fail = 0;
function check(label, ok, detail) {
  if (!ok) { fail++; console.log('FAIL  ' + label + (detail ? '  ' + detail : '')); }
}

/* ۱) هر روز از ۱۹۵۰ تا ۲۱۰۰ در برابر تقویم فارسی ICU */
let checked = 0;
for (let d = new Date(1950, 0, 1); d.getFullYear() < 2101; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
  const j = J.fromDate(d), i = icu(d);
  checked++;
  if (j.jy !== i.y || j.jm !== i.m || j.jd !== i.d) {
    check('ICU ' + d.toDateString(), false, 'mine ' + j.jy + '/' + j.jm + '/' + j.jd + ' icu ' + i.y + '/' + i.m + '/' + i.d);
  }
}
console.log('ICU cross-check (1950..2100): ' + checked + ' days');

/* ۲) برگشت‌پذیری میلادی ← شمسی ← میلادی برای هر روز ۱۹۰۰..۲۲۰۰ */
let rt = 0;
for (let d = new Date(1900, 0, 1); d.getFullYear() < 2200; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
  const j = J.fromDate(d), g = J.toGregorian(j.jy, j.jm, j.jd);
  rt++;
  if (g.gy !== d.getFullYear() || g.gm !== d.getMonth() + 1 || g.gd !== d.getDate()) {
    check('round-trip ' + d.toDateString(), false, JSON.stringify(j) + ' -> ' + JSON.stringify(g));
  }
}
console.log('round-trip: ' + rt + ' days');

/* ۳) طول ماه‌ها (شامل اسفند و سال کبیسه) در برابر فاصله واقعی روزها */
let ml = 0;
for (let y = 1300; y < 1500; y++) {
  for (let m = 1; m <= 12; m++) {
    const nm = m === 12 ? { y: y + 1, m: 1 } : { y: y, m: m + 1 };
    const a = J.toGregorian(y, m, 1), b = J.toGregorian(nm.y, nm.m, 1);
    const real = Math.round((Date.UTC(b.gy, b.gm - 1, b.gd) - Date.UTC(a.gy, a.gm - 1, a.gd)) / 86400000);
    ml++;
    if (real !== J.monthLength(y, m)) check('monthLength ' + y + '/' + m, false, J.monthLength(y, m) + ' vs ' + real);
    const ia = icu(new Date(a.gy, a.gm - 1, a.gd));
    if (ia.y !== y || ia.m !== m || ia.d !== 1) check('toGregorian ' + y + '/' + m, false, JSON.stringify(ia));
  }
}
console.log('month lengths: ' + ml + ' months');

/* ۴) نقاط مرجع معروف */
[[2026, 3, 21, 1405, 1, 1], [2026, 10, 4, 1405, 7, 12], [1979, 2, 11, 1357, 11, 22]].forEach(a => {
  const r = J.toJalaali(a[0], a[1], a[2]);
  check('anchor ' + a[0] + '-' + a[1] + '-' + a[2], r.jy === a[3] && r.jm === a[4] && r.jd === a[5],
    r.jy + '/' + r.jm + '/' + r.jd);
});

/* ۵) قالب ذخیره‌سازی و بازخوانی */
const iso = J.toStorageFromJ(1405, 7, 12, 15, 30);
check('storage format', iso === '2026-10-04T15:30', iso);
check('parse round-trip', !!J.parse(iso) && J.toStorage(J.parse(iso)) === iso);
check('parse rejects garbage', J.parse('1405/7/12') === null && J.parse('2026-02-30T10:00') === null);
check('isValid', J.isValid(1405, 7, 12) && !J.isValid(1405, 7, 31) && !J.isValid(1405, 13, 1));
check('fa digits', J.fa(1405 + '/' + 7) === '۱۴۰۵/۷');
check('dateKey/keyText', J.dateKey(new Date(2026, 9, 4)) === '2026-10-04'
  && J.keyText('2026-10-04') === 'یکشنبه ۱۲ مهر ۱۴۰۵ — ۰۰:۰۰', J.keyText('2026-10-04'));
check('storageText fallback', J.storageText('', 'ثبت نشده') === 'ثبت نشده'
  && J.storageText('bad', 'ثبت نشده') === 'ثبت نشده'
  && J.storageText(new Date('bad'), 'ثبت نشده') === 'ثبت نشده');
check('weekday (یکشنبه=1)', J.WEEK_SHORT[J.weekdayIndex(new Date(2026, 9, 4))] === 'ی');

console.log(fail ? 'RESULT: FAIL (' + fail + ')' : 'RESULT: ALL PASS');
process.exit(fail ? 1 : 0);
