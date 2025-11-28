// proxy-setup.js
import { setGlobalDispatcher, ProxyAgent } from 'undici';


// 代理配置
const proxyUrl = process.env.PROXY_URL || 'http://127.0.0.1:1080';
const testUrl = 'https://www.google.com'; // 用于测试网络连接的 URL

/**
 * 测试是否能直接访问外网（不使用代理）
 * @returns {Promise<boolean>} true 表示可以直接访问，false 表示无法访问
 */
async function canAccessDirectly() {
  try {
    const response = await fetch(testUrl, {
      method: 'HEAD',
      timeout: 5000,
      signal: AbortSignal.timeout(5000),
    });
    console.log(`[Network] Direct access to ${testUrl} succeeded (HTTP ${response.status})`);
    return true;
  } catch (error) {
    console.log(`[Network] Direct access to ${testUrl} failed: ${error.message}`);
    return false;
  }
}

/**
 * 测试代理是否可用
 * @returns {Promise<boolean>} true 表示代理可用，false 表示无法使用
 */
async function isProxyAvailable() {
  try {
    const proxyAgent = new ProxyAgent(proxyUrl);
    const response = await fetch(testUrl, {
      method: 'HEAD',
      dispatcher: proxyAgent,
      timeout: 5000,
      signal: AbortSignal.timeout(5000),
    });
    console.log(`[Network] Proxy access via ${proxyUrl} succeeded (HTTP ${response.status})`);
    return true;
  } catch (error) {
    console.log(`[Network] Proxy access via ${proxyUrl} failed: ${error.message}`);
    return false;
  }
}

/**
 * 根据网络环境自动配置代理
 */
async function setupProxy() {
  console.log('[Network] Detecting network environment...');

  // 1. 尝试直接访问
  const directOk = await canAccessDirectly();
  if (directOk) {
    console.log('[Proxy] Using direct network access (no proxy needed)');
    // 清除代理环境变量，确保不使用代理
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    return;
  }

  // 2. 直接访问失败，尝试使用代理
  console.log('[Proxy] Direct access failed, trying proxy...');
  const proxyOk = await isProxyAvailable();
  if (proxyOk) {
    // 为 undici 设置全局代理
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    
    // 为 node-fetch 和其他库设置环境变量代理
    // (Google Auth Library 和其他库会读取这些变量)
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;
    process.env.https_proxy = proxyUrl;
    process.env.http_proxy = proxyUrl;
    
    console.log(`[Proxy] Global fetch proxy set to: ${proxyUrl}`);
    console.log(`[Proxy] Environment variables (HTTP_PROXY, HTTPS_PROXY) also set for node-fetch and other libraries`);
    return;
  }

  // 3. 代理也不可用，发出警告但继续运行（让程序自行判断失败）
  console.warn(`[Proxy] ⚠️  Both direct access and proxy (${proxyUrl}) are unavailable!`);
  console.warn('[Proxy] Program will attempt to run without proxy. Network requests may fail.');
}

// 执行网络检测和代理配置
await setupProxy();