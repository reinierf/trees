import { parseStringPromise, processors } from 'xml2js';
import { processSpecies } from '../lib/species.js';

const OBK_SOURCES = [
    { label: 'blijdorp (OBK)', url: 'https://openbomenkaart.org/data/trees_blijdorp.json' },
];

function toObkTree(element) {
    const t = element?.tags;
    if (!t || element.lat == null || element.lon == null) return null;

    const rawSpecies = (t.species ?? '').trim();
    const speciesResult = processSpecies(rawSpecies);
    if (!speciesResult) return null;

    const diameter = t.diameter != null ? parseFloat(String(t.diameter).replace('~', '').replace(',', '.')) : null;

    return {
        id:              String(t.admin_ref || element.id || ''),
        lat:             +parseFloat(element.lat).toFixed(7),
        lon:             +parseFloat(element.lon).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: null,
        year_planted:    t.planted && t.planted !== '?' ? String(t.planted) : null,
        neighbourhood:   null,
        street:          null,
        trunk_diameter:  diameter != null && !Number.isNaN(diameter) ? diameter : null,
        crown_spread:    null,
    };
}

function parseObkSource(raw) {
    const elements = JSON.parse(raw).elements ?? [];
    const trees = elements.map(toObkTree).filter(Boolean);
    return { trees };
}

const WFS_URL = 'https://ows.gis.rotterdam.nl/cgi-bin/mapserv.exe';
const MAP      = 'd:\\gwr\\webdata\\mapserver\\map\\bbdwh_pub.map';

const FIELD_MAP = {
    ID: 'id',
    AANLEGJAAR: 'year_planted',
    BOOMSORTIMENT_NEDERLANDS: 'name_vernacular',
    BOOMSORTIMENT: 'species',
    WIJK: 'neighbourhood',
    STRAAT: 'street',
    DIAMETER: 'trunk_diameter',
    KROONOMVANG: 'crown_spread',
};

const PROPERTY_NAMES = ['GEOM', ...Object.keys(FIELD_MAP)].join(',');

function applyVernacularTypoCorrections(s) {
    return s.replace(/\bSIERAPPPEL\b/, 'SIERAPPEL');
}

function sanitiseVernacularName(s) {
    if (!s) return null;
    s = s.trim().replace(/\s+/g, ' ');
    if (s.startsWith('-')) return null;
    const dashIdx = s.indexOf(' -');
    if (dashIdx !== -1) s = s.slice(0, dashIdx).trim();
    s = s.replace(/\s*\(CV\)\s*$/i, '').replace(/\s*\(V\)\s*$/i, '').trim();
    if (!s || s.toUpperCase() === 'NIET INBOETEN') return null;
    return s;
}

function sanitiseTree(tree) {
    if (!tree) return null;
    const result = processSpecies(tree.species);
    if (!result) return null;
    Object.assign(tree, result);
    const rawIndigenous = (tree.name_vernacular ?? '').trim().replace(/\s+/g, ' ');
    tree.name_vernacular = sanitiseVernacularName(applyVernacularTypoCorrections(rawIndigenous));
    return tree;
}

function parsePoint(geomNode) {
    if (!geomNode) return null;
    const point = geomNode.Point ?? geomNode['gml:Point'];
    if (!point) return null;
    const raw = point.pos ?? point['gml:pos'];
    if (!raw) return null;
    const parts = (typeof raw === 'string' ? raw : raw[0]).trim().split(/\s+/);
    if (parts.length < 2) return null;
    // SRSNAME=urn:ogc:def:crs:EPSG::4326 → WFS 2.0.0 returns (lat, lon) per EPSG axis order
    return { lat: +parseFloat(parts[0]).toFixed(7), lon: +parseFloat(parts[1]).toFixed(7) };
}

function toTree(featureNode) {
    if (!featureNode) return null;
    const tree = {};
    for (const [key, val] of Object.entries(featureNode)) {
        if (key === '$') continue;
        const scalar = Array.isArray(val) ? val[0] : val;
        if (scalar && typeof scalar === 'object' && (scalar.Point ?? scalar['gml:Point'])) {
            const coords = parsePoint(scalar);
            if (coords) { tree.lat = coords.lat; tree.lon = coords.lon; }
            continue;
        }
        const mapped = FIELD_MAP[key];
        if (!mapped) continue;
        const text = typeof scalar === 'string' ? scalar : (scalar?._ ?? '');
        tree[mapped] = text;
    }
    return tree;
}

export default {
    name: 'rotterdam',
    wfsUrl: WFS_URL,
    layer: 'ms:obs_bmn_alg',
    outputFile: { json: 'rotterdam.json', sqlite: 'rotterdam.db' },
    // Rotterdam's WFS server has a certificate chain issue; encoding bug: declares UTF-8 but sends latin1.
    fetchOptions: { rejectUnauthorized: false, encoding: 'latin1' },
    supplemental: OBK_SOURCES.map(src => ({
        ...src,
        fetchOptions: { rejectUnauthorized: false },
        parse: parseObkSource,
    })),

    pageParams(layer, count, startIndex) {
        return new URLSearchParams({
            map: MAP, SERVICE: 'WFS', VERSION: '2.0.0',
            REQUEST: 'GetFeature', TYPENAMES: layer,
            SRSNAME: 'urn:ogc:def:crs:EPSG::4326',
            COUNT: String(count), STARTINDEX: String(startIndex),
            PROPERTYNAME: PROPERTY_NAMES,
        });
    },

    countParams(layer) {
        return new URLSearchParams({
            map: MAP, SERVICE: 'WFS', VERSION: '2.0.0',
            REQUEST: 'GetFeature', TYPENAMES: layer, resultType: 'hits',
        });
    },

    async parse(raw, _layer) {
        const doc = await parseStringPromise(raw, {
            explicitArray: false,
            tagNameProcessors: [processors.stripPrefix],
            attrNameProcessors: [processors.stripPrefix],
        });
        if (doc?.ExceptionReport) {
            const msg = doc.ExceptionReport.Exception?.ExceptionText ?? JSON.stringify(doc.ExceptionReport);
            throw new Error(`WFS exception: ${msg}`);
        }
        const collection = doc?.FeatureCollection;
        if (!collection) throw new Error('No FeatureCollection in response');
        let members = collection.member ?? [];
        if (!Array.isArray(members)) members = [members];
        // Feature nodes are nested under the typename's local part
        const localName = this.layer.split(':').pop();
        const trees = members.map(m => sanitiseTree(toTree(m[localName]))).filter(Boolean);
        return { trees, rawCount: members.length };
    },

    async parseCount(raw) {
        const doc = await parseStringPromise(raw, {
            explicitArray: false, tagNameProcessors: [processors.stripPrefix],
        });
        return parseInt(doc?.FeatureCollection?.$.numberMatched ?? '0', 10) || 0;
    },
};
