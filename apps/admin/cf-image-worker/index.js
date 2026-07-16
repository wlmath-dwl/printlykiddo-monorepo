// 极简版 index.js - 仅保留核心逻辑，无任何第三方依赖
const imageProxyWorker = {
    async fetch(request, env) {
      const url = new URL(request.url);
      const imagePath = url.pathname.slice(1).toLowerCase();
  
      // 空路径返回404
      if (!imagePath) {
        return new Response(JSON.stringify({ 
          code: 404, 
          msg: '图片路径不能为空' 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
  
      try {
        // 1. 防刷图：IP频率限制
        const rateLimit = await this.checkRateLimit(env, request);
        if (!rateLimit.allowed) {
          return new Response(JSON.stringify({
            code: 429,
            msg: '请求过于频繁，请1分钟后重试'
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': rateLimit.resetTime.toString()
            }
          });
        }
  
        // 2. 防盗链：仅允许 printlykiddo.com
        const antiLeech = this.checkAntiLeech(request);
        if (!antiLeech.allowed) {
          return new Response(JSON.stringify({
            code: 403,
            msg: '禁止盗链，仅允许 printlykiddo.com 域名访问'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
  
        // 3. 访问私有 R2 根目录对象
        const r2Key = imagePath;
        const object = await env.IMG_R2.get(r2Key);
        if (!object) {
          return new Response(JSON.stringify({
            code: 404,
            msg: '图片不存在或已被删除'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
  
        // 4. 返回图片（带缓存+CORS）
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
        headers.set('Access-Control-Allow-Origin', antiLeech.origin || '*');
        headers.set('Access-Control-Allow-Methods', 'GET');
        headers.set('X-RateLimit-Limit', '100');
        headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
        headers.set('X-RateLimit-Reset', rateLimit.resetTime.toString());
  
        return new Response(object.body, { headers });
      } catch (error) {
        return new Response(JSON.stringify({
          code: 500,
          msg: '服务器内部错误',
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    },
  
    // 防刷图工具函数（内置，无依赖）
    async checkRateLimit(env, request) {
      const LIMIT = 100;
      const WINDOW = 60;
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = `rate_limit_${ip}`;
  
      const count = await env.RATE_LIMIT_KV.get(key) || 0;
      const resetTime = Math.floor(Date.now() / 1000) + WINDOW;
  
      if (parseInt(count) >= LIMIT) {
        return { allowed: false, remaining: 0, resetTime };
      }
  
      await env.RATE_LIMIT_KV.put(key, (parseInt(count) + 1).toString(), {
        expirationTtl: WINDOW
      });
  
      return {
        allowed: true,
        remaining: LIMIT - parseInt(count) - 1,
        resetTime
      };
    },
  
    // 防盗链工具函数（内置，无依赖）
    checkAntiLeech(request) {
      const ALLOWED_DOMAINS = [
        'https://printlykiddo.com',
        'http://localhost:4538'
      ];
  
      const origin = request.headers.get('Origin');
      const referer = request.headers.get('Referer');
  
      if (!origin && !referer) {
        return { allowed: true, origin: '*' };
      }
  
      if (origin && ALLOWED_DOMAINS.includes(origin)) {
        return { allowed: true, origin };
      }
  
      if (referer && ALLOWED_DOMAINS.some(d => referer.startsWith(d))) {
        return { allowed: true, origin: origin || '*' };
      }
  
      return { allowed: false, origin: null };
    }
  };

export default imageProxyWorker;