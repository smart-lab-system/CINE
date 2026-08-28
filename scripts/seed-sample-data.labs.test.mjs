import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hostPrefixFromRoomCode,
  labsFromJson,
  loadLabsFromFile,
  workstationHostname,
} from './seed-sample-data.mjs';

test('derives host prefix as ToàTầngSTT from room code', () => {
  assert.equal(hostPrefixFromRoomCode('H1.1'), 'H11');
  assert.equal(hostPrefixFromRoomCode('B1.6'), 'B16');
  assert.equal(hostPrefixFromRoomCode('A2.2'), 'A22');
});

test('formats workstation hostname as ToàTầngSTT.XX', () => {
  assert.equal(workstationHostname('H1.1', 1), 'H11.01');
  assert.equal(workstationHostname('H1.1', 40), 'H11.40');
  assert.equal(workstationHostname('B1.6', 1), 'B16.01');
});

test('rejects workstation numbers outside 1-99', () => {
  assert.throws(() => workstationHostname('H1.1', 0), /1-99/);
  assert.throws(() => workstationHostname('H1.1', 100), /1-99/);
});

test('maps danh_sach_phong_may rows to API lab payloads', () => {
  assert.deepEqual(
    labsFromJson([
      {
        ma: 'H1.1',
        ten: 'Phòng máy H1.1 - Lab lập trình - Kỹ thuật phần mềm',
        toa: 'H',
        sucChua: 40,
        trangThai: 'Hoạt động',
      },
    ]),
    [
      {
        code: 'H1.1',
        name: 'Phòng máy H1.1 - Lab lập trình - Kỹ thuật phần mềm',
        building: 'H',
        floor: '1',
        capacity: 40,
        isActive: true,
      },
    ],
  );
});

test('marks inactive labs from trangThai', () => {
  const [lab] = labsFromJson([
    {
      ma: 'H1.1',
      ten: 'Phòng máy H1.1',
      toa: 'H',
      sucChua: 40,
      trangThai: 'Ngừng hoạt động',
    },
  ]);
  assert.equal(lab.isActive, false);
});

test('H1.1 capacity yields hostnames H11.01 through H11.40', () => {
  const labs = loadLabsFromFile();
  const lab = labs.find((item) => item.code === 'H1.1');
  assert.ok(lab);
  const hostnames = Array.from({ length: lab.capacity }, (_, i) =>
    workstationHostname(lab.code, i + 1),
  );
  assert.equal(hostnames[0], 'H11.01');
  assert.equal(hostnames[hostnames.length - 1], 'H11.40');
  assert.equal(new Set(hostnames).size, lab.capacity);
});

test('loads danh_sach_phong_may.json into API lab payloads', () => {
  const labs = loadLabsFromFile();
  assert.equal(labs.length, 39);
  assert.equal(labs[0].code, 'H1.1');
  assert.equal(labs[0].building, 'H');
  assert.equal(labs[0].floor, '1');
  assert.equal(labs[0].capacity, 40);
  assert.equal(labs[0].isActive, true);

  const b16 = labs.find((lab) => lab.code === 'B1.6');
  assert.ok(b16);
  assert.equal(b16.building, 'B');
  assert.equal(b16.floor, '1');
  assert.equal(b16.capacity, 40);

  const codes = labs.map((lab) => lab.code);
  assert.equal(new Set(codes).size, codes.length);

  for (const lab of labs) {
    assert.match(lab.code, /^[A-Za-z0-9._-]{2,32}$/);
    assert.ok(lab.name.length >= 1);
    assert.ok(lab.name.length <= 150);
    assert.ok(Number.isInteger(lab.capacity));
    assert.ok(lab.capacity >= 1);
    assert.ok(lab.capacity <= 99);
    assert.match(hostPrefixFromRoomCode(lab.code), /^[A-Za-z]+\d+$/);
  }
});

test('rejects duplicate room codes', () => {
  assert.throws(
    () =>
      labsFromJson([
        { ma: 'H1.1', ten: 'A', toa: 'H', sucChua: 40, trangThai: 'Hoạt động' },
        { ma: 'H1.1', ten: 'B', toa: 'H', sucChua: 40, trangThai: 'Hoạt động' },
      ]),
    /Duplicate lab code/,
  );
});
