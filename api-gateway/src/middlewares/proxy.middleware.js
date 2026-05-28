const httpProxy = require('http-proxy');
const { getServiceByPath, resolveReqApiPath } = require('../config/services');
const { URL } = require('url');

const isProd = process.env.NODE_ENV === 'production';

// Cache proxy instances để tránh tạo lại mỗi request
const proxyCache = new Map();

/** Phản hồi lỗi proxy an toàn — không lộ stack cho client (production). */
function sendProxyError(res, statusCode, message, err = null, meta = {}) {
  if (res.headersSent) return;
  const body = { success: false, message };
  if (meta.serviceName) {
    body.service = meta.serviceName;
  }
  if (!isProd && err) {
    body.debug = {
      code: err.code,
      detail: err.message,
      ...(meta.upstreamUrl ? { upstreamUrl: meta.upstreamUrl } : {}),
    };
  }
  return res.status(statusCode).json(body);
}

function isUpstreamUnavailableError(err) {
  const code = String(err?.code || '').toUpperCase();
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ].includes(code);
}

/**
 * Middleware proxy request đến microservice
 */
const proxyMiddleware = (req, res, next) => {
  const apiPath = resolveReqApiPath(req);
  // Tìm service phù hợp với path
  const service = getServiceByPath(apiPath);

  // Debug log: xem request đang đi đâu
  // eslint-disable-next-line no-console
  console.log(`[API-Gateway] Incoming ${req.method} ${apiPath} -> service:`, service?.name || 'NONE');
  console.log(`[API-Gateway] Service URL:`, service?.url);
  console.log(`[API-Gateway] Full target URL will be:`, service?.url ? `${service.url}${apiPath}` : 'N/A');

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  // Validate service URL - không được proxy đến chính Gateway
  if (!service.url || service.url.includes('localhost:3000') || service.url.includes(':3000')) {
    console.error(`[API-Gateway] ❌ Invalid service URL detected: ${service.url}`);
    console.error(`[API-Gateway] This would cause proxy loop!`);
    return sendProxyError(res, 500, 'Invalid service configuration', new Error('gateway loop'), {
      serviceName: service.name,
    });
  }

  // Lưu service URL vào biến để đảm bảo không bị thay đổi
  const targetUrl = service.url;
  const serviceName = service.name;
  const serviceUrl = service.url;
  
  // Parse URL để đảm bảo format đúng
  const targetUrlObj = new URL(targetUrl);
  const proxyHost = targetUrlObj.hostname;
  const proxyPort = parseInt(targetUrlObj.port) || (targetUrlObj.protocol === 'https:' ? 443 : 80);
  const proxyTarget = `${targetUrlObj.protocol}//${proxyHost}:${proxyPort}`;
  const queryStart = String(req.originalUrl || req.url || '').indexOf('?');
  const queryString = queryStart >= 0 ? String(req.originalUrl || req.url || '').slice(queryStart) : '';
  req.url = `${apiPath}${queryString}`;
  const fullTargetUrl = `${targetUrl}${req.url}`;
  
  console.log(`[API-Gateway] Creating proxy to: ${targetUrl}`);
  console.log(`[API-Gateway] Full target URL: ${fullTargetUrl}`);
  
  // Dùng proxyTarget làm cache key thay vì targetUrl gốc
  let proxy = proxyCache.get(proxyTarget);
  
  if (!proxy) {
    console.log(`[API-Gateway] Creating new proxy instance for ${proxyTarget}`);
    
    // Tạo proxy server với các options
    // Dùng object với hostname và port
    proxy = httpProxy.createProxyServer({
      target: {
        protocol: targetUrlObj.protocol,
        host: proxyHost,
        port: proxyPort,
      },
      changeOrigin: true,
      timeout: 60000, // 60 seconds timeout
      proxyTimeout: 60000, // 60 seconds proxy timeout
      ws: false, // Không cần WebSocket
      xfwd: true, // Forward X-Forwarded-* headers
      secure: false, // Tắt SSL verification cho localhost
      followRedirects: true,
    });
    
    // Xử lý proxy errors - lưu service info vào proxy instance để dùng trong error handler
    proxy.on('error', (err, req, res) => {
      // Lấy service info từ request hoặc từ proxy instance
      const serviceInfo = req._serviceInfo || { name: 'unknown', url: targetUrl };
      const svcName = serviceInfo.name;
      const svcUrl = serviceInfo.url;
      
      console.error(`[API-Gateway] ❌ ========== PROXY ERROR ==========`);
      console.error(`[API-Gateway] ❌ Proxy error for ${req.path || req.url}:`, err.message);
      console.error(`[API-Gateway] Error code:`, err.code);
      console.error(`[API-Gateway] Error name:`, err.name);
      console.error(`[API-Gateway] Error stack:`, err.stack);
      console.error(`[API-Gateway] Target service:`, svcUrl);
      console.error(`[API-Gateway] Request method:`, req.method);
      console.error(`[API-Gateway] Request URL:`, req.url);
      
      // Xử lý timeout / upstream unreachable error
      const errMeta = { serviceName: svcName, upstreamUrl: svcUrl };
      if (isUpstreamUnavailableError(err) || err.message?.includes('timeout')) {
        console.error(`[API-Gateway] ❌ Timeout connecting to ${svcUrl}`);
        if (res && !res.headersSent) {
          return sendProxyError(res, 504, 'Gateway timeout', err, errMeta);
        }
      }
      
      // Xử lý service unreachable / DNS resolve fail
      if (isUpstreamUnavailableError(err)) {
        console.error(`[API-Gateway] ❌ Cannot reach ${svcUrl}`);
        if (res && !res.headersSent) {
          return sendProxyError(res, 503, 'Service unavailable', err, errMeta);
        }
      }
      
      if (res && !res.headersSent) {
        sendProxyError(res, 503, 'Service unavailable', err, errMeta);
      }
    });
    
    // Cache proxy instance với proxyTarget
    proxyCache.set(proxyTarget, proxy);
    console.log(`[API-Gateway] Proxy instance cached for ${proxyTarget}`);
  } else {
    console.log(`[API-Gateway] Using cached proxy instance for ${proxyTarget}`);
  }

  // Lưu service info vào request để dùng trong error handler
  req._serviceInfo = { name: serviceName, url: targetUrl };
  
  // Thực thi proxy
  console.log(`[API-Gateway] Executing proxy for ${req.method} ${req.path}`);
  console.log(`[API-Gateway] Request headers present:`, !!req.headers);
  console.log(`[API-Gateway] Request body present:`, !!req.body);
  console.log(`[API-Gateway] ✅ ========== PROXY REQUEST STARTED ==========`);
  console.log(`[API-Gateway] Proxying ${req.method} ${req.path} to ${fullTargetUrl}`);
  
  // Forward user info trong header (nếu có) + bằng chứng gateway cho microservice
  const gatewayToken = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (gatewayToken) {
    req.headers['x-gateway-internal-token'] = gatewayToken;
  }
  if (req.user) {
    req.headers['x-user-id'] = req.user.id;
    if (req.user.email) {
      req.headers['x-user-email'] = req.user.email;
    } else {
      delete req.headers['x-user-email'];
    }
  }
  
  // Đảm bảo Content-Type được forward
  if (req.headers['content-type']) {
    console.log(`[API-Gateway] Content-Type: ${req.headers['content-type']}`);
  }
  
  // Thêm event listeners để debug
  req.on('error', (err) => {
    console.error(`[API-Gateway] ❌ Request error:`, err);
  });
  
  res.on('error', (err) => {
    console.error(`[API-Gateway] ❌ Response error:`, err);
  });
  
  // `close` có thể fire trước khi `headersSent` được set với proxy/304 — không dùng để báo lỗi giả
  res.on('finish', () => {
    console.log(`[API-Gateway] Response finished ${req.method} ${req.path} status=${res.statusCode}`);
  });
  
  // Proxy response handler - dùng once để chỉ listen một lần cho request này
  const proxyResHandler = (proxyRes, reqProxy, resProxy) => {
    // Chỉ log nếu đây là request của chúng ta
    if (reqProxy === req) {
      console.log(`[API-Gateway] ✅ Response from ${serviceName}: ${proxyRes.statusCode}`);
      console.log(`[API-Gateway] Response headers:`, JSON.stringify(proxyRes.headers, null, 2));
    }
  };
  
  proxy.once('proxyRes', proxyResHandler);
  
  try {
    // Gọi proxy.web() để forward request
    // Proxy instance đã được config với target khi tạo, không cần pass lại
    proxy.web(req, res, {}, (err) => {
      // Callback này được gọi nếu có lỗi
      if (err) {
        console.error(`[API-Gateway] ❌ Proxy.web() callback error:`, err);
        console.error(`[API-Gateway] Error message:`, err.message);
        console.error(`[API-Gateway] Error code:`, err.code);
        
        // Xử lý service không chạy / DNS không resolve được
        if (isUpstreamUnavailableError(err)) {
          console.error(`[API-Gateway] ❌ Cannot reach ${serviceName} at ${targetUrl}`);
          if (!res.headersSent) {
            return sendProxyError(res, 503, 'Service unavailable', err, {
              serviceName,
              upstreamUrl: targetUrl,
            });
          }
        }
        
        if (!res.headersSent) {
          return sendProxyError(res, 500, 'Service error', err, { serviceName, upstreamUrl: targetUrl });
        }
      }
    });
    
    console.log(`[API-Gateway] Proxy.web() called successfully`);
  } catch (error) {
    console.error(`[API-Gateway] ❌ Error executing proxy:`, error);
    console.error(`[API-Gateway] Error stack:`, error.stack);
    if (!res.headersSent) {
      return sendProxyError(res, 500, 'Service error', error, { serviceName, upstreamUrl: targetUrl });
    }
  }
};

module.exports = proxyMiddleware;
