import https from 'https';

export function fetchRaw(url, params, { rejectUnauthorized = true, encoding = 'utf8' } = {}) {
    return new Promise((resolve, reject) => {
        const agent = rejectUnauthorized === false
            ? new https.Agent({ rejectUnauthorized: false })
            : undefined;
        // URLSearchParams uses '+' for spaces; WFS servers expect '%20'
        const qs = params.toString().replace(/\+/g, '%20');
        // Some ArcGIS/IIS servers silently drop requests without a User-Agent header.
        const options = { headers: { 'User-Agent': 'bomen-fetcher/1.0' } };
        if (agent) options.agent = agent;
        const req = https.get(`${url}?${qs}`, options, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
        });
        req.on('error', reject);
    });
}
