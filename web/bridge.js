/* External plugin bridge. No SDK network calls occur until begin() is called. */
(function (root) {
  'use strict';
  const methods = new Set([
    'isSupport', 'getUserProfile', 'getAuthorProfile', 'getAuthorRelation',
    'getCloudStorage', 'setCloudStorage', 'removeCloudStorage',
    'submitScore', 'getRankList', 'getMyRank', 'getQrCode', 'share',
    'getContainerState', 'setContainerMode', 'checkInputSafety'
  ]);
  const schema = 'evengine.toy.request';
  function packet(state, payload = {}) { return { schema, version: 1, state, ...payload }; }
  function createBridge(getSdk, options = {}) {
    const requests = new Map();
    let sequence = 0;
    const timeout = options.timeout ?? 30000;
    const maxRequests = options.maxRequests ?? 128;
    const maxBytes = 256 * 1024;
    const clockSet = options.setTimeout ?? setTimeout;
    const clockClear = options.clearTimeout ?? clearTimeout;
    function fail(error) {
      return packet('failed', { error: {
        type: String(error?.type ?? 'bridge_error'),
        code: error?.code ?? null,
        message: String(error?.message ?? error ?? 'Toy call failed')
      } });
    }
    return Object.freeze({
      begin(method, json) {
        if (requests.size >= maxRequests || sequence >= 2147483647 ||
            typeof json !== 'string' || new TextEncoder().encode(json).length > maxBytes) return 0;
        const token = ++sequence;
        const entry = { result: packet('pending'), timer: null };
        requests.set(token, entry);
        const finish = result => {
          if (requests.get(token) !== entry || entry.result.state !== 'pending') return;
          clockClear(entry.timer);
          entry.result = result;
        };
        entry.timer = clockSet(() => finish(fail({ type: 'timeout', message: 'Toy call timed out; remote outcome may be unknown' })), timeout);
        try {
          if (!methods.has(method)) throw { type: 'unsupported', message: 'SDK method is not supported by this plugin' };
          const args = JSON.parse(json);
          if (!Array.isArray(args)) throw { type: 'invalid_param', message: 'Expected positional argument array' };
          const sdk = getSdk();
          if (!sdk || typeof sdk[method] !== 'function') throw { type: 'unsupported', message: 'Toy SDK is unavailable' };
          // Call immediately, before a microtask, preserving browser user activation.
          Promise.resolve(sdk[method](...args)).then(value => {
            try {
              const serialised = JSON.stringify(packet('succeeded', { value: value ?? null }));
              if (new TextEncoder().encode(serialised).length > maxBytes)
                throw { type: 'response_too_large', message: 'Toy response exceeds plugin transport budget' };
              finish(JSON.parse(serialised));
            } catch (error) { finish(fail(error)); }
          }, error => finish(fail(error)));
        } catch (error) { finish(fail(error)); }
        return token;
      },
      poll(token) {
        const entry = requests.get(token);
        if (!entry) return fail({ type: 'stale_handle', message: 'Unknown or consumed Toy token' });
        if (entry.result.state !== 'pending') requests.delete(token);
        return entry.result;
      },
      cancel(token) {
        const entry = requests.get(token);
        if (!entry) return false;
        clockClear(entry.timer);
        requests.delete(token);
        return true;
      }
    });
  }
  root.EVEToyCreateBridge = createBridge;
  root.EVEToyBridge = createBridge(() => root.toy);
})(globalThis);
