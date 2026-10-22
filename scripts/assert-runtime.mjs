const expected = "22.23.4";
if (process.versions.node !== expected) {
  throw new Error(`Expected security-pinned Node ${expected}; received ${process.versions.node}`);
}
console.log(`[runtime] Node ${process.versions.node}`);
