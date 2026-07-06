# visualize-math

Interactive linear algebra visualizer — a Desmos-style setup for matrices and vectors.
Define objects on the left, write an expression, and watch the operation happen on the right:
animated 2D grid transformations for the geometry, and step-by-step numeric animations for
the arithmetic.

**Live:** https://bryan3342.github.io/visualize-math/

## What it does

A whiteboard for teaching linear algebra. The left panel defines named matrices and vectors
(each rendered live on the whiteboard's Objects shelf) and takes an expression; the
whiteboard previews the equation exactly as typed, then Go plays a color-coded,
step-by-step walkthrough to its conclusion — with a clickable start-to-finish timeline,
a legend, and an explicit explanation per step. Editing an object re-runs the current
expression with the new numbers.

Operations:

- **Matrix multiplication** — `A*B` (or `A*v`) fills the product in cell by cell as
  color-coded row·column dot products, with the full arithmetic spelled out.
- **Eigenvectors & eigenvalues** — `eig(A)` reports λ and the eigenvectors, then verifies
  `A·v = λ·v` numerically. Complex, repeated, and defective cases are reported honestly.
- **Elementary row operations** — `rref(M)` plays the reduction one elementary row operation
  at a time (`R2 ← R2 − 2·R1`, swaps, scalings) with pivot rows and pivot entries highlighted.
- **Determinants** — `det(A)` walks the `a·d − b·c` formula with diagonal highlights.
- **More** — entry-by-entry addition/subtraction, scalar multiplication, transposition, and
  general expressions: `2A + B`, `inv(A)*A`, `B^4`, parentheses, implicit multiplication (`2A`).

## Syntax

| Form | Meaning |
|------|---------|
| `A*B`, `A B`, `2A` | product (explicit or implicit) |
| `+` `-` `/` `^` | add, subtract, divide by scalar, integer powers (`A^-1` = inverse) |
| `det(A)` | determinant |
| `inv(A)` | inverse |
| `trans(A)` | transpose |
| `rref(M)` | reduced row-echelon form, animated as row operations |
| `eig(A)` | eigenvalues/eigenvectors of a 2×2, drawn on the plane |
| `[1 2; 3 4]` | inline matrix literal — spaces/commas between entries, `;` between rows |

## Stack

Zero-dependency vanilla JavaScript in a single module (`js/app.js`). No build step, no
backend, no runtime network calls — everything computes in the browser. Deployed on GitHub
Pages straight from `main`.

**Deploying a change**: bump the `?v=` query on `styles.css` and `js/app.js` in
`index.html`. GitHub Pages caches each file for ~10 minutes independently, so without the
version bump a returning browser can mix a new HTML with stale JS (or vice versa) and
break the page. The single-file layout exists for the same reason — module imports can't
skew against each other if there's only one module.

## Local dev

```bash
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

Tests (math engine + parser) run with [Bun](https://bun.sh):

```bash
bun test
```
