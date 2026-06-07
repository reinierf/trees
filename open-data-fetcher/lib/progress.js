export function drawProgress(fetched, total) {
    if (!process.stderr.isTTY) return;
    const W      = 40;
    const pct    = total > 0 ? fetched / total : 0;
    const filled = Math.round(W * pct);
    const bar    = '='.repeat(filled).padEnd(W);
    const label  = `${fetched} / ${total} (${Math.round(pct * 100)}%)`;
    process.stderr.write(`\r[${bar}] ${label}  `);
    if (fetched >= total) process.stderr.write('\n');
}
