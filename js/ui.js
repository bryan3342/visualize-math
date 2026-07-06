// Left panel: define named matrices and vectors.

const MATRIX_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S'];
const VECTOR_NAMES = ['v', 'w', 'u', 'p', 'q', 'r', 's', 't'];

export class ObjectsPanel {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.objects = [];
    root.innerHTML = `
      <div class="objects-list"></div>
      <div class="objects-add">
        <div class="add-row">
          <button class="add-matrix">+ Matrix</button>
          <select class="add-rows">${sizeOpts(1, 6, 2)}</select><span class="dim-sep">×</span><select class="add-cols">${sizeOpts(1, 6, 2)}</select>
        </div>
        <div class="add-row">
          <button class="add-vector">+ Vector</button>
          <select class="add-dim">${sizeOpts(2, 6, 2)}</select><span class="dim-sep">entries</span>
        </div>
      </div>`;
    this.list = root.querySelector('.objects-list');
    root.querySelector('.add-matrix').addEventListener('click', () => {
      this.add('matrix', Number(root.querySelector('.add-rows').value), Number(root.querySelector('.add-cols').value));
    });
    root.querySelector('.add-vector').addEventListener('click', () => {
      this.add('vector', Number(root.querySelector('.add-dim').value), 1);
    });
  }

  seed() {
    this.objects.push(
      { name: 'A', data: [[2, 1], [1, 2]] },
      { name: 'B', data: [[0, -1], [1, 0]] },
      { name: 'v', data: [[2], [1]] },
      { name: 'M', data: [[1, 2, -1], [2, 4, 1], [3, 6, 0]] },
    );
    this.render();
  }

  add(kind, rows, cols) {
    const pool = kind === 'matrix' ? MATRIX_NAMES : VECTOR_NAMES;
    const used = new Set(this.objects.map((o) => o.name));
    const name = pool.find((n) => !used.has(n));
    if (!name) return;
    const data = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => (i === j ? 1 : 0)),
    );
    this.objects.push({ name, data });
    this.render();
    this.onChange();
  }

  remove(name) {
    this.objects = this.objects.filter((o) => o.name !== name);
    this.render();
    this.onChange();
  }

  env() {
    return new Map(this.objects.map((o) => [o.name, o.data]));
  }

  render() {
    this.list.innerHTML = '';
    for (const obj of this.objects) {
      const rows = obj.data.length;
      const cols = obj.data[0].length;
      const card = document.createElement('div');
      card.className = 'object-card';
      card.innerHTML = `
        <div class="object-head">
          <span class="object-name">${obj.name}</span>
          <span class="object-dims">${cols === 1 ? `ℝ${sup(rows)}` : `${rows}×${cols}`}</span>
          <button class="object-del" title="Delete ${obj.name}">×</button>
        </div>
        <div class="object-grid" style="grid-template-columns: repeat(${cols}, 1fr)"></div>`;
      const grid = card.querySelector('.object-grid');
      obj.data.forEach((row, i) =>
        row.forEach((val, j) => {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.value = formatEntry(val);
          input.addEventListener('input', () => {
            const parsed = parseEntry(input.value);
            input.classList.toggle('invalid', parsed === null);
            if (parsed !== null) {
              obj.data[i][j] = parsed;
              this.onChange();
            }
          });
          grid.appendChild(input);
        }),
      );
      card.querySelector('.object-del').addEventListener('click', () => this.remove(obj.name));
      this.list.appendChild(card);
    }
  }
}

function parseEntry(text) {
  const t = text.trim();
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function formatEntry(v) {
  return String(parseFloat(v.toFixed(4)));
}

function sizeOpts(min, max, selected) {
  let out = '';
  for (let n = min; n <= max; n++) out += `<option ${n === selected ? 'selected' : ''}>${n}</option>`;
  return out;
}

function sup(n) {
  return { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' }[n] ?? `^${n}`;
}
