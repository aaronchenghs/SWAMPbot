export function cosine(a: Float32Array | number[], b: Float32Array | number[]) {
  let dot = 0,
    ax = 0,
    bx = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]),
      y = Number(b[i]);
    dot += x * y;
    ax += x * x;
    bx += y * y;
  }
  return dot / (Math.sqrt(ax) * Math.sqrt(bx) + 1e-8);
}
