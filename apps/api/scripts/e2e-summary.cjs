// Tóm tắt báo cáo JSON của jest thành bảng so sánh được bằng `diff`.
//
//   npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e.json
//   node scripts/e2e-summary.cjs C:/tmp/e2e.json > after.tsv
//
// Một suite KHÔNG biên dịch được không có assertion nào; nó được ghi là
// `failed = 1` kèm hậu tố `!` ở tên, để `diff` không bao giờ coi nó là "0 test
// pass, 0 test fail" rồi cho qua.
const fs = require('node:fs');
const path = require('node:path');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/e2e-summary.cjs <jest-json-file>');
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = report.testResults
  .map((suite) => {
    const count = (status) => suite.assertionResults.filter((a) => a.status === status).length;
    const broken = suite.assertionResults.length === 0 && suite.status === 'failed';
    return [
      path.basename(suite.name) + (broken ? '!' : ''),
      count('passed'),
      broken ? 1 : count('failed'),
      count('pending') + count('todo'),
    ];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const row of rows) {
  console.log(row.join('\t'));
}
const sum = (i) => rows.reduce((total, row) => total + row[i], 0);
console.log(['TOTAL', sum(1), sum(2), sum(3)].join('\t'));
