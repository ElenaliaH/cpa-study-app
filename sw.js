// Service Worker — 离线缓存
var CACHE_NAME = 'cpa-study-v2';
var BASE = '/cpa-study-app';
var FILES_TO_CACHE = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/css/style.css',
  BASE + '/js/vendor/supabase.js',
  BASE + '/js/store.js',
  BASE + '/js/modal.js',
  BASE + '/js/progress.js',
  BASE + '/js/supabaseClient.js',
  BASE + '/js/supabaseStorage.js',
  BASE + '/js/countdown.js',
  BASE + '/js/tasks.js',
  BASE + '/js/checkin.js',
  BASE + '/js/subjects.js',
  BASE + '/js/focus.js',
  BASE + '/js/backup.js',
  BASE + '/js/restday.js',
  BASE + '/js/app.js',
  BASE + '/manifest.json',
  BASE + '/icon.svg'
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
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request).catch(function () {
        return new Response('离线模式，请连接网络');
      });
    })
  );
});
