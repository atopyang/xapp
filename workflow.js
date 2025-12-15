const canvas = document.getElementById('canvas');
const connectionLayer = document.querySelector('.connection-layer');
const statusEl = document.getElementById('status');
const inspector = document.getElementById('inspector');
const btnReset = document.getElementById('btnReset');
const btnAutoLayout = document.getElementById('btnAutoLayout');

const nodes = [];
const connections = [];
let pendingConnection = null;
let draggingNode = null;
let dragOffset = { x: 0, y: 0 };
let selectedNodeId = null;
let activePointerId = null;

const descriptions = {
  Trigger: '启动工作流的入口，可绑定 Webhook 或定时器触发。',
  'HTTP Request': '通过 REST API 拉取或推送数据，支持自定义 header 和 body。',
  'Data Transform': '格式化、映射或拼接字段，为后续步骤准备数据。',
  Condition: '根据表达式或脚本对数据做条件分流，走向不同分支。',
  Delay: '添加等待或节流，避免请求打爆下游服务。',
  Notifier: '通过邮件、企业 IM、短信推送任务结果。'
};

function updateStatus(message) {
  statusEl.textContent = message;
}

function createNode(type, x, y) {
  const id = `node-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const node = { id, type, x, y };
  nodes.push(node);
  const element = renderNode(node);
  canvas.appendChild(element);
  focusNode(id);
  updateInspector(node);
  updateStatus(`新增 ${type} 节点，点击输出点再选目标即可连线`);
  drawConnections();
}

function renderNode(node) {
  const el = document.createElement('div');
  el.className = 'node';
  el.setAttribute('tabindex', '0');
  el.dataset.id = node.id;
  el.style.transform = `translate(${node.x}px, ${node.y}px)`;

  const header = document.createElement('div');
  header.className = 'header';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = node.type;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = '可拖动';

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = descriptions[node.type] || '可视化自定义节点';

  const handles = document.createElement('div');
  handles.className = 'handles';

  const inputHandle = document.createElement('button');
  inputHandle.className = 'handle input';
  inputHandle.title = '输入点';
  inputHandle.innerHTML = '⟵';
  inputHandle.addEventListener('click', () => handleInputClick(node));

  const outputHandle = document.createElement('button');
  outputHandle.className = 'handle output';
  outputHandle.title = '输出点';
  outputHandle.innerHTML = '⟶';
  outputHandle.addEventListener('click', (event) => handleOutputClick(event, node));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = '可视化';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn';
  deleteBtn.title = '删除节点';
  deleteBtn.textContent = '✕';
  deleteBtn.addEventListener('click', () => removeNode(node.id));

  actions.append(chip, deleteBtn);

  header.append(title, meta);
  handles.append(inputHandle, outputHandle);
  el.append(header, body, actions, handles);

  enableDragging(el, node);
  el.addEventListener('focusin', () => focusNode(node.id));
  el.addEventListener('click', () => focusNode(node.id));

  return el;
}

function enableDragging(element, node) {
  element.addEventListener('pointerdown', (event) => {
    if (event.target.classList.contains('handle')) return;
    event.preventDefault();
    draggingNode = node;
    activePointerId = event.pointerId;
    dragOffset = {
      x: event.clientX - node.x,
      y: event.clientY - node.y
    };
    element.setPointerCapture(event.pointerId);
    element.style.cursor = 'grabbing';
  });

  element.addEventListener('pointermove', (event) => {
    if (!draggingNode || event.pointerId !== activePointerId) return;
    if (draggingNode.id !== node.id) return;
    const canvasRect = canvas.getBoundingClientRect();
    const newX = Math.max(0, Math.min(canvasRect.width - 220, event.clientX - dragOffset.x - canvasRect.left));
    const newY = Math.max(0, Math.min(canvasRect.height - 140, event.clientY - dragOffset.y - canvasRect.top));
    node.x = newX;
    node.y = newY;
    element.style.transform = `translate(${newX}px, ${newY}px)`;
    drawConnections();
  });

  element.addEventListener('pointerup', (event) => {
    if (!draggingNode || event.pointerId !== activePointerId) return;
    draggingNode = null;
    activePointerId = null;
    element.releasePointerCapture(event.pointerId);
    element.style.cursor = 'grab';
  });
}

function handleOutputClick(event, node) {
  event.stopPropagation();
  pendingConnection = { from: node.id };
  updateStatus(`已选择 ${node.type} 输出，点击目标节点的输入点完成连线`);
  document.querySelectorAll('.node').forEach((n) => n.classList.toggle('pending', n.dataset.id === node.id));
}

function handleInputClick(targetNode) {
  if (!pendingConnection) {
    updateStatus('请先选择要连接的输出点');
    return;
  }
  if (pendingConnection.from === targetNode.id) {
    updateStatus('不能连接到同一节点');
    return;
  }
  connections.push({ from: pendingConnection.from, to: targetNode.id });
  pendingConnection = null;
  updateStatus('连线完成，节点已串联');
  document.querySelectorAll('.node').forEach((n) => n.classList.remove('pending'));
  drawConnections();
}

function cancelPendingConnection() {
  if (!pendingConnection) return;
  pendingConnection = null;
  document.querySelectorAll('.node').forEach((n) => n.classList.remove('pending'));
  updateStatus('已取消连接选择');
}

function removeNode(id) {
  const index = nodes.findIndex((n) => n.id === id);
  if (index === -1) return;
  nodes.splice(index, 1);
  const element = document.querySelector(`[data-id="${id}"]`);
  element?.remove();
  for (let i = connections.length - 1; i >= 0; i -= 1) {
    if (connections[i].from === id || connections[i].to === id) {
      connections.splice(i, 1);
    }
  }
  if (selectedNodeId === id) {
    selectedNodeId = null;
    inspector.innerHTML = '<p class="placeholder">选择节点查看配置</p>';
  }
  updateStatus('节点已删除');
  drawConnections();
}

function drawConnections() {
  connectionLayer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  connections.forEach((link) => {
    const fromEl = document.querySelector(`[data-id="${link.from}"] .handle.output`);
    const toEl = document.querySelector(`[data-id="${link.to}"] .handle.input`);
    if (!fromEl || !toEl) return;
    const start = centerOf(fromEl);
    const end = centerOf(toEl);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', buildCurve(start, end));
    path.setAttribute('stroke', '#7c3aed');
    path.classList.toggle('highlight', selectedNodeId === link.from || selectedNodeId === link.to);
    fragment.appendChild(path);
  });
  connectionLayer.appendChild(fragment);
}

function centerOf(el) {
  const canvasRect = canvas.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - canvasRect.left + rect.width / 2,
    y: rect.top - canvasRect.top + rect.height / 2
  };
}

function buildCurve(start, end) {
  const offset = Math.max(80, Math.abs(end.x - start.x) / 2);
  return `M ${start.x} ${start.y} C ${start.x + offset} ${start.y} ${end.x - offset} ${end.y} ${end.x} ${end.y}`;
}

function focusNode(id) {
  selectedNodeId = id;
  document.querySelectorAll('.node').forEach((n) => n.classList.toggle('selected', n.dataset.id === id));
  const node = nodes.find((n) => n.id === id);
  if (node) updateInspector(node);
  drawConnections();
}

function updateInspector(node) {
  inspector.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = node.type;
  const desc = document.createElement('p');
  desc.textContent = descriptions[node.type] || '自定义节点，支持编辑参数。';

  const coords = document.createElement('div');
  coords.className = 'row';
  coords.innerHTML = `<span class="label">位置</span><span>${Math.round(node.x)} , ${Math.round(node.y)}</span>`;

  const connInfo = document.createElement('div');
  connInfo.className = 'row';
  const incoming = connections.filter((c) => c.to === node.id).length;
  const outgoing = connections.filter((c) => c.from === node.id).length;
  connInfo.innerHTML = `<span class="label">连线</span><span>${incoming} 入 / ${outgoing} 出</span>`;

  inspector.append(title, desc, coords, connInfo);
}

function autoLayout() {
  if (!nodes.length) return;
  const columns = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = 260;
  const spacingY = 180;
  nodes.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    node.x = col * spacingX + 40;
    node.y = row * spacingY + 40;
    const el = document.querySelector(`[data-id="${node.id}"]`);
    if (el) el.style.transform = `translate(${node.x}px, ${node.y}px)`;
  });
  drawConnections();
  updateStatus('自动排版完成');
}

function resetCanvas() {
  nodes.splice(0, nodes.length);
  connections.splice(0, connections.length);
  canvas.innerHTML = '';
  connectionLayer.innerHTML = '';
  inspector.innerHTML = '<p class="placeholder">选择节点查看配置</p>';
  pendingConnection = null;
  updateStatus('画布已清空，拖拽左侧节点开始');
}

function initPalette() {
  document.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', item.dataset.nodeType);
      updateStatus(`正在拖拽 ${item.dataset.nodeType} 节点`);
    });
  });
}

function initCanvasDrop() {
  canvas.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain');
    if (!type) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - 40;
    const y = event.clientY - rect.top - 30;
    createNode(type, x, y);
  });

  canvas.addEventListener('click', () => cancelPendingConnection());
}

function boot() {
  initPalette();
  initCanvasDrop();
  btnReset.addEventListener('click', resetCanvas);
  btnAutoLayout.addEventListener('click', autoLayout);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelPendingConnection();
  });
  updateStatus('等待拖拽节点到画布');
  createNode('Trigger', 80, 60);
}

document.addEventListener('DOMContentLoaded', boot);
