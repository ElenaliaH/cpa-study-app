/* ================================================================
   backup.js — 数据导出/导入
   用法：Backup.exportData()  /  Backup.importData()
   ================================================================ */

var Backup = (function () {
  'use strict';

  /** 导出：下载 JSON 文件 */
  function exportData() {
    var data = Store.exportAllData();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);

    var a = document.createElement('a');
    var now = new Date();
    var filename = 'cpa-study-backup-' +
      now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '.json';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 导入：打开文件选择器 */
  function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var json = JSON.parse(e.target.result);
          var err  = Store.validateImportData(json);
          if (err) {
            alert('❌ ' + err);
            return;
          }

          var exportedAt = json.exportedAt
            ? new Date(json.exportedAt).toLocaleString('zh-CN')
            : '未知时间';
          var subjectCount = (json.subjects || []).length;
          var taskCount    = (json.manualTasks || []).length;
          var focusCount   = (json.focus_sessions || []).length;

          Modal.confirm(
            '即将导入备份数据：\n\n' +
            '📅 导出时间：' + exportedAt + '\n' +
            '📚 科目数：' + subjectCount + '\n' +
            '✅ 手动任务数：' + taskCount + '\n\n' +
            '导入后将覆盖当前所有数据，确定继续？',
            function (ok) {
              if (!ok) return;
              var importErr = Store.importAllData(json);
              if (importErr) {
                alert('❌ 导入失败：' + importErr);
                return;
              }
              alert('✅ 数据导入成功！页面即将刷新。');
              location.reload();
            }
          );
        } catch (ex) {
          alert('❌ JSON 格式错误，无法解析文件。\n请确认选择的是 CPA Study 备份文件。');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  return { exportData: exportData, importData: importData };
})();
