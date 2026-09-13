/* Local-only fixture adapter; never contacts the production data API. */
var WorkspaceDemo = (function () {
  'use strict';
  var dbKey = 'study:demo:workspaces';
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function readRows() {
    var raw = localStorage.getItem(dbKey);
    if (raw) return JSON.parse(raw);
    var rows = ['cpa', 'tax_advisor'].map(function (exam) {
      return { id: 'demo-' + exam + '-2026', user_id: 'demo-user', exam_type: exam, year: 2026, status: 'active', revision: 0, last_write_id: null, data: WorkspaceLogic.freshData(exam, 2026) };
    });
    localStorage.setItem(dbKey, JSON.stringify(rows));
    return rows;
  }
  function saveRows(rows) { localStorage.setItem(dbKey, JSON.stringify(rows)); }
  return {
    list: async function () { return readRows(); },
    read: async function (scope) {
      var row = readRows().find(function (r) { return r.id === scope.id && r.user_id === scope.user_id; });
      if (!row) throw new Error('空间不存在');
      return clone(row);
    },
    save: async function (scope, pending) {
      var rows = readRows(), row = rows.find(function (r) { return r.id === scope.id && r.user_id === scope.user_id; });
      if (!row) throw new Error('空间不存在');
      if (row.last_write_id === pending.writeId) return { conflict: false, row: clone(row) };
      if (row.revision !== pending.revision || row.status !== 'active') return { conflict: true, row: clone(row) };
      row.data = clone(pending.data); row.revision++; row.last_write_id = pending.writeId;
      saveRows(rows); return { conflict: false, row: clone(row) };
    },
    create: async function (exam, year, data) {
      var rows = readRows();
      if (rows.some(function (r) { return r.exam_type === exam && r.year === year; })) throw new Error('该年度已存在');
      var row = { id: 'demo-' + exam + '-' + year, user_id: 'demo-user', exam_type: exam, year: year, status: 'active', revision: 0, data: clone(data) };
      rows.push(row); saveRows(rows); return clone(row);
    },
    archive: async function (scope, revision, status) {
      var rows = readRows(), row = rows.find(function (r) { return r.id === scope.id; });
      if (row.revision !== revision) throw new Error('数据已更新，请刷新');
      row.status = status; row.revision++; saveRows(rows);
    }
  };
})();
