(async function () {
  'use strict';
  const status = document.getElementById('status');
  window.addEventListener('error', event => { status.textContent = '游戏运行失败：' + (event.message || '脚本加载失败'); });
  window.addEventListener('unhandledrejection', event => { status.textContent = '游戏运行失败：' + String(event.reason?.message ?? event.reason); });
  try {
    const report = await EVEToyProbe(document.body.dataset.requiresThreads !== 'false');
    document.getElementById('report').textContent = JSON.stringify(report, null, 2);
    if (!report.canStart) {
      status.textContent = '当前容器无法启动此 WebGPU 游戏，请查看环境报告。';
      return;
    }
    status.textContent = '正在加载游戏…';
    // Emscripten emits the actual runtime entry here; keep it inert until the probe passes.
    const source = document.getElementById('engine-entry').content.querySelector('script[src]');
    if (!source) throw new Error('Emscripten runtime script entry is missing.');
    const script = document.createElement('script');
    script.src = source.getAttribute('src');
    script.onerror = () => { status.textContent = '游戏运行时加载失败。'; };
    document.body.append(script);
  } catch (error) { status.textContent = String(error.message ?? error); }
})();
