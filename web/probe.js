(function (root) {
  'use strict';
  root.EVEToyProbe = async function (requiresThreads = true) {
    const report = {
      schema: 'evengine.toy.environment', version: 1,
      secureContext: root.isSecureContext === true,
      webgpu: !!root.navigator?.gpu,
      crossOriginIsolated: root.crossOriginIsolated === true,
      sharedArrayBuffer: typeof root.SharedArrayBuffer !== 'undefined',
      requiresThreads, deviceCreated: false, errors: []
    };
    if (!report.secureContext) report.errors.push('WebGPU requires a secure context.');
    if (!report.webgpu) report.errors.push('This browser/container does not expose WebGPU.');
    if (requiresThreads && (!report.crossOriginIsolated || !report.sharedArrayBuffer))
      report.errors.push('This EVEngine build needs cross-origin isolation and SharedArrayBuffer. Local headers cannot prove Toy hosting supports them.');
    if (report.webgpu && report.secureContext) {
      try {
        const adapter = await root.navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter available.');
        const device = await adapter.requestDevice();
        report.deviceCreated = true;
        device.destroy();
      } catch (error) { report.errors.push(String(error.message ?? error)); }
    }
    report.canStart = report.errors.length === 0 && report.deviceCreated;
    return report;
  };
})(globalThis);
