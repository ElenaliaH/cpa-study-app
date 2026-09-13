/* Pure workspace metadata and fresh-year templates. */
var WorkspaceLogic = (function () {
  'use strict';
  var exams = {
    cpa: { name: 'CPA', subjects: ['会计', '审计', '财务成本管理', '税法', '经济法', '公司战略与风险管理'] },
    tax_advisor: { name: '税务师', subjects: ['税法一', '税法二', '涉税服务实务', '涉税服务相关法律', '财务与会计'] }
  };
  var subjectCodes = {
    cpa: ['accounting', 'audit', 'financial_management', 'tax_law', 'economic_law', 'strategy'],
    tax_advisor: ['tax_law_i', 'tax_law_ii', 'tax_practice', 'tax_related_law', 'finance_accounting']
  };
  function subjectsFor(exam) {
    return (subjectCodes[exam] || []).map(function (code, index) { return { code: code, name: exams[exam].subjects[index] }; });
  }
  function practiceSelection(exam, banks, requestedSubject, requestedBank) {
    var codes = subjectsFor(exam).map(function (subject) { return subject.code; });
    var ownBanks = (banks || []).filter(function (bank) { return bank.exam_type === exam && codes.indexOf(bank.subject_code) >= 0; });
    var subject = codes.indexOf(requestedSubject) >= 0 ? requestedSubject : (ownBanks[0] ? ownBanks[0].subject_code : codes[0]);
    var matches = ownBanks.filter(function (bank) { return bank.subject_code === subject; });
    return { subject: subject, banks: matches, bank: matches.find(function (bank) { return bank.id === requestedBank; }) || matches[0] || null };
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function label(workspace) { return exams[workspace.exam_type].name + ' ' + workspace.year; }
  function validate(exam, year) {
    if (!exams[exam] || !Number.isInteger(Number(year)) || year < 2000 || year > 2100) throw new Error('考试或年度无效');
  }
  function freshData(exam, year, template) {
    validate(exam, year);
    var subjects = template ? clone(template.subjects || []) : exams[exam].subjects.map(function (name) { return { name: name, rounds: [] }; });
    var now = new Date().toISOString();
    subjects.forEach(function (subject, i) {
      subject.id = exam + '_' + year + '_s' + i;
      subject.createdAt = now;
      subject.rounds = (subject.rounds || []).map(function (round, j) {
        return {
          id: subject.id + '_r' + j, name: round.name || '', deadline: '',
          totalWork: Number(round.totalWork || 0), unit: round.unit || '课时',
          maxDailyCapacity: round.maxDailyCapacity || 6, minTaskEnabled: !!round.minTaskEnabled,
          minTaskAmount: round.minTaskAmount || 1, minTaskType: round.minTaskType || 'amount',
          minTaskMinutes: round.minTaskMinutes || 30, restDays: [], courseItems: [], checkins: [], createdAt: now
        };
      });
    });
    return { examDate: '', subjects: subjects, manualTasks: [], mistakes: [], focus_sessions: [], schemaVersion: 2 };
  }
  return { exams: exams, subjectsFor: subjectsFor, practiceSelection: practiceSelection, label: label, validate: validate, freshData: freshData, clone: clone };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WorkspaceLogic;
