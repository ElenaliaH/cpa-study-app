/* ================================================================
   supabaseClient.js — Supabase SDK 初始化
   ================================================================ */

var SUPABASE_URL = 'https://efhlbnashkkujrsvckvl.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_XZeLlNxKWNnUCjmtk222wg_38uhDuy6';

var supabaseClient = null;

(function () {
  'use strict';
  if (typeof supabase === 'undefined') {
    console.error('[Supabase] SDK 未加载');
  } else {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: 'cpa_supabase_auth' }
    });
    console.log('[Supabase] 客户端已创建');
  }
})();
