document.getElementById('run').onclick = async function () {
  const report = await EVEToyProbe(true);
  document.getElementById('report').textContent = JSON.stringify(report, null, 2);
};
