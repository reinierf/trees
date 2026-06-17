import zlib from 'zlib';
import proj4 from 'proj4';
import { processSpecies } from '../lib/species.js';

const DATA_URL = 'https://dataportaal.apeldoorn.nl/Data/Openbare_ruimte_en_Verkeer/BOR/shape/bomen_openbare_ruimte.zip';

// EPSG:28992 RD New
const RD_NEW = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38720621111111 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs';
const rdToWgs84 = proj4(RD_NEW, 'WGS84');

// "60 - 70 cm" → 0.65, "< 20 cm" → 0.10 (metres)
function parseDiameter(s) {
    if (!s) return null;
    const range = s.match(/(\d+)\s*-\s*(\d+)/);
    if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2 / 100;
    const lt = s.match(/<\s*(\d+)/);
    if (lt) return parseInt(lt[1], 10) / 2 / 100;
    return null;
}

// Walk ZIP local file headers; returns { basename: Buffer }
function extractZip(buf) {
    const files = {};
    let pos = 0;
    while (pos + 30 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
        const method    = buf.readUInt16LE(pos + 8);
        const compSize  = buf.readUInt32LE(pos + 18);
        const nameLen   = buf.readUInt16LE(pos + 26);
        const extraLen  = buf.readUInt16LE(pos + 28);
        const name      = buf.toString('ascii', pos + 30, pos + 30 + nameLen);
        const dataStart = pos + 30 + nameLen + extraLen;
        const compressed = buf.slice(dataStart, dataStart + compSize);
        const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
        const base = name.split('/').pop();
        if (base) files[base] = data;
        pos = dataStart + compSize;
    }
    return files;
}

// Parse DBF; returns array of { fieldname: value } objects for active records
function parseDbf(buf) {
    const recordCount = buf.readUInt32LE(4);
    const headerSize  = buf.readUInt16LE(8);
    const recordSize  = buf.readUInt16LE(10);

    const fields = [];
    let off = 32;
    while (off < headerSize - 1 && buf[off] !== 0x0D) {
        const name = buf.toString('latin1', off, off + 11).replace(/\0.*/, '');
        const len  = buf[off + 16];
        fields.push({ name: name.toLowerCase(), len });
        off += 32;
    }

    const records = [];
    let pos = headerSize;
    for (let i = 0; i < recordCount; i++, pos += recordSize) {
        if (buf[pos] === 0x2A) continue;  // deleted
        const rec = {};
        let fpos = pos + 1;
        for (const { name, len } of fields) {
            rec[name] = buf.toString('latin1', fpos, fpos + len).trim();
            fpos += len;
        }
        records.push(rec);
    }
    return records;
}

// Parse SHP point file; returns array of { x, y } or null, aligned to DBF rows
function parseShp(buf) {
    const points = [];
    let pos = 100;  // skip file header
    while (pos + 8 <= buf.length) {
        const contentBytes = buf.readUInt32BE(pos + 4) * 2;
        pos += 8;
        if (buf.length < pos + 4) break;
        const shapeType = buf.readUInt32LE(pos);
        if (shapeType === 1 && pos + 20 <= buf.length) {
            points.push({ x: buf.readDoubleLE(pos + 4), y: buf.readDoubleLE(pos + 12) });
        } else {
            points.push(null);
        }
        pos += contentBytes;
    }
    return points;
}

function toTree(rec, point, idx) {
    if (!point) return null;
    const [lon, lat] = rdToWgs84.forward([point.x, point.y]);

    const rawSpecies = rec.boomsoort ?? '';
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    return {
        id:              rec.object_gui || String(idx),
        lat:             +lat.toFixed(7),
        lon:             +lon.toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    rec.aanlegjaar || null,
        neighbourhood:   rec.buurt || rec.wijk || null,
        street:          rec.straat || null,
        trunk_diameter:  parseDiameter(rec.diameter),
        crown_spread:    null,
    };
}

export default {
    name: 'apeldoorn',
    wfsUrl: DATA_URL,
    layer: null,
    singleFetch: true,
    outputFile: { json: 'apeldoorn.json', sqlite: 'apeldoorn.db' },
    fetchOptions: { encoding: 'binary', rejectUnauthorized: false },

    async parse(raw) {
        const buf = Buffer.from(raw, 'binary');
        const files = extractZip(buf);

        const shpKey = Object.keys(files).find(k => k.endsWith('.shp'));
        const dbfKey = Object.keys(files).find(k => k.endsWith('.dbf'));
        if (!shpKey || !dbfKey) throw new Error('Apeldoorn ZIP missing .shp or .dbf');

        const points  = parseShp(files[shpKey]);
        const records = parseDbf(files[dbfKey]);
        if (points.length !== records.length) {
            throw new Error(`Apeldoorn SHP/DBF count mismatch: ${points.length} vs ${records.length}`);
        }

        const trees = records.map((rec, i) => toTree(rec, points[i], i)).filter(Boolean);
        return { trees };
    },
};
