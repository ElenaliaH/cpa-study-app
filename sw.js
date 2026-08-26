// Service Worker — 离线缓存
var CACHE_NAME = 'cpa-study-v13';
var FILES_TO_CACHE = [
  './',
  './index.html',
  './css/style.css?v=20260827a',
  './js/vendor/supabase.js',
  './js/store.js',
  './js/modal.js',
  './js/progress.js',
  './js/supabaseClient.js',
  './js/supabaseStorage.js',
  './js/countdown.js',
  './js/tasks.js',
  './js/checkin.js',
  './js/subjects.js',
  './js/focus.js',
  './js/taxPracticeLogic.js?v=20260827a',
  './js/taxPracticeData.js?v=20260827c',
  './js/taxPractice.js?v=20260827c',
  './js/backup.js',
  './js/restday.js',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

// 安装：预缓存所有文件
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// 请求：缓存优先，网络回退
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var requestUrl = new URL(e.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.indexOf('/api/') >= 0) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, copy); });
        }
        return response;
      });
    })
  );
});
