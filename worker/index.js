/* ================================================================
   Cloudflare Worker — CPA Study API 中转（测试版）
   部署后访问 https://xxx.workers.dev/ping 测试连通性
   ================================================================ */

var SUPABASE_URL = 'https://efhlbnashkkujrsvckvl.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_XZeLlNxKWNnUCjmtk222wg_38uhDuy6';

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var path = url.pathname;

    // CORS 允许所有来源（测试阶段）
    var corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── /ping ──
    if (path === '/ping') {
      return new Response(JSON.stringify({
        ok: true,
        message: 'worker alive',
        time: new Date().toISOString()
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // ── /supabase-test ──
    if (path === '/supabase-test') {
      try {
        // 尝试访问 Supabase REST API 的健康检查
        var res = await fetch(SUPABASE_URL + '/rest/v1/', {
          headers: { 'apikey': SUPABASE_ANON_KEY }
        });
        var text = await res.text();

        return new Response(JSON.stringify({
          ok: true,
          supabaseStatus: res.status,
          supabaseResponse: text.substring(0, 200),
          message: 'Worker 能正常访问 Supabase'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        return new Response(JSON.stringify({
          ok: false,
          error: err.message,
          message: 'Worker 无法连接 Supabase'
        }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // ── 404 ──
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
