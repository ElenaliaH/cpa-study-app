/* Revisioned snapshots. Failed reads never become empty remote data. */
var WorkspaceSync = (function () {
  'use strict';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function Sync(options) {
    this.storage = options.storage;
    this.remote = options.remote;
    this.notify = options.notify || function () {};
    this.writer = options.writer;
    this.entries = {};
  }
  Sync.prototype.prefix = function (scope) { return 'study:v1:' + scope.user_id + ':' + scope.id + ':'; };
  Sync.prototype.pending = function (scope) {
    var prefix = this.prefix(scope) + 'pending:';
    var rows = [];
    for (var i = 0; i < this.storage.length; i++) {
      var key = this.storage.key(i);
      if (key.indexOf(prefix) === 0) {
        var value = JSON.parse(this.storage.getItem(key));
        rows.push({ key: key, value: value });
      }
    }
    return rows;
  };
  Sync.prototype.cache = function (scope, row) {
    this.storage.setItem(this.prefix(scope) + 'cloud', JSON.stringify(row));
  };
  Sync.prototype.load = async function (scope) {
    var key = this.prefix(scope);
    var row;
    try {
      row = await this.remote.read(copy(scope));
      if (!row || row.id !== scope.id || row.user_id !== scope.user_id) throw new Error('空间读取结果无效');
      this.cache(scope, row);
    } catch (error) {
      var saved = this.storage.getItem(key + 'cloud');
      if (!saved) throw new Error('云端空间加载失败，本机也没有此空间的缓存。请联网后重试。');
      row = JSON.parse(saved);
      this.notify('offline', scope);
    }
    var pending = this.pending(scope);
    var usable = pending.filter(function (p) { return p.value.writeId !== row.last_write_id; });
    pending.forEach(function (p) {
      if (p.value.writeId === row.last_write_id) this.storage.removeItem(p.key);
    }, this);
    var entry = { scope: copy(scope), row: copy(row), busy: null, conflict: null, pendingKey: null, pending: null };
    this.entries[key] = entry;
    if (usable.length) {
      entry.pending = copy(usable[0].value);
      entry.pendingKey = usable[0].key;
      if (usable.length > 1 || entry.pending.revision !== row.revision || row.status !== 'active') {
        entry.conflict = copy(row);
        this.notify('conflict', scope);
      } else this.notify('pending', scope);
    }
    return { row: row, data: copy(entry.pending ? entry.pending.data : row.data), conflict: !!entry.conflict };
  };
  Sync.prototype.stage = function (scope, data) {
    var key = this.prefix(scope), entry = this.entries[key];
    if (!entry) throw new Error('空间尚未加载');
    if (entry.row.status !== 'active') throw new Error('此年度已归档，请先恢复为备考中');
    if (entry.conflict) throw new Error('请先处理同步冲突');
    var pending = { data: copy(data), revision: entry.row.revision, writeId: this.writer + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) };
    // A separate writer key preserves another tab's offline changes.
    var pendingKey = key + 'pending:' + this.writer;
    this.storage.setItem(pendingKey, JSON.stringify(pending));
    if (entry.pendingKey && entry.pendingKey !== pendingKey) {
      var previous = this.storage.getItem(entry.pendingKey);
      if (previous && JSON.parse(previous).writeId === entry.pending.writeId) this.storage.removeItem(entry.pendingKey);
    }
    entry.pendingKey = pendingKey;
    entry.pending = pending;
    this.notify('pending', scope);
  };
  Sync.prototype.matchesPending = function (entry, pending) {
    var stored = this.storage.getItem(entry.pendingKey);
    return !!stored && JSON.parse(stored).writeId === pending.writeId;
  };
  Sync.prototype.flush = function (scope) {
    var self = this, key = this.prefix(scope), entry = this.entries[key];
    if (!entry || !entry.pending) return Promise.resolve(true);
    if (entry.conflict) return Promise.resolve(false);
    if (entry.busy) return entry.busy;
    entry.busy = (async function () {
      while (entry.pending && !entry.conflict) {
        var sent = copy(entry.pending);
        try {
          // A resumed draft may have advanced in its original tab since load().
          if (!self.matchesPending(entry, sent)) {
            entry.conflict = copy(entry.row);
            self.notify('conflict', scope);
            return false;
          }
          var result = await self.remote.save(copy(scope), sent);
          if (!result || result.conflict) {
            entry.conflict = result && result.row || entry.row;
            self.notify('conflict', scope);
            return false;
          }
          entry.row = copy(result.row);
          self.cache(scope, entry.row);
          if (entry.pending.writeId === sent.writeId) {
            // Only acknowledge this exact write; another tab can replace the
            // persisted draft while the network request is in flight.
            if (self.matchesPending(entry, sent)) self.storage.removeItem(entry.pendingKey);
            entry.pending = null;
          } else {
            if (!self.matchesPending(entry, entry.pending)) {
              entry.conflict = copy(entry.row);
              self.notify('conflict', scope);
              return false;
            }
            entry.pending.revision = entry.row.revision;
            self.storage.setItem(entry.pendingKey, JSON.stringify(entry.pending));
          }
        } catch (error) {
          self.notify('offline', scope);
          return false;
        }
      }
      self.notify('saved', scope);
      return true;
    })().finally(function () { entry.busy = null; });
    return entry.busy;
  };
  Sync.prototype.resolve = async function (scope, useLocal) {
    var entry = this.entries[this.prefix(scope)];
    if (!entry || !entry.conflict) return;
    var remote = await this.remote.read(copy(scope));
    var pending = this.pending(scope);
    // Preserve both versions for recovery before either explicit choice.
    this.storage.setItem(this.prefix(scope) + 'recovery:' + Date.now(), JSON.stringify({ remote: remote, pending: pending }));
    pending.forEach(function (p) { this.storage.removeItem(p.key); }, this);
    var local = entry.pending && copy(entry.pending.data);
    entry.row = remote;
    entry.pending = null;
    entry.conflict = null;
    this.cache(scope, remote);
    if (useLocal && local) {
      this.stage(scope, local);
      if (!await this.flush(scope)) throw new Error('同步尚未完成，本机副本已保留');
    }
  };
  return Sync;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WorkspaceSync;
