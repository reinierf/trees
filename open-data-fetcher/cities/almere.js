import { processSpeciesTagged } from '../lib/species.js';

const BASE_URL = 'https://services2.arcgis.com/rtefou6JFIxFvYTf/arcgis/rest/services/Bomen_Almere/FeatureServer/0/query';

function toTree(feature) {
    const a = feature.attributes;
    const g = feature.geometry;
    if (!g?.x || !g?.y) return { dropped: 'no_geometry' };

    const rawSpecies = (a.soort ?? '').trim();
    const speciesResult = processSpeciesTagged(rawSpecies);
    if (speciesResult.dropped) return { dropped: speciesResult.dropped, value: rawSpecies };

    return {
        id:              String(a.OBJECTID),
        lat:             +parseFloat(g.y).toFixed(7),
        lon:             +parseFloat(g.x).toFixed(7),
        species:         rawSpecies,
        ...speciesResult,
        name_vernacular: a.soort_nl || null,
        year_planted:    a.plantjaar ? String(a.plantjaar) : null,
        neighbourhood:   a.buurt || a.wijk || null,
        street:          a.straat || null,
        trunk_diameter:  a.Stamdiameter_cm ? a.Stamdiameter_cm / 100 : null,
        crown_spread:    null,
    };
}

export default {
    name: 'almere',
    wfsUrl: BASE_URL,
    layer: null,
    outputFile: { json: 'almere.json', sqlite: 'almere.db' },

    pageParams(_layer, count, startIndex) {
        return new URLSearchParams({
            where:             '1=1',
            outFields:         'OBJECTID,soort,soort_nl,plantjaar,buurt,wijk,straat,Stamdiameter_cm',
            f:                 'json',
            outSR:             '4326',
            resultOffset:      String(startIndex),
            resultRecordCount: String(count),
        });
    },

    countParams(_layer) {
        return new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
    },

    async parse(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        const features = json.features ?? [];
        const trees = [];
        const dropped = {};
        for (const r of features.map(toTree)) {
            if (r.dropped) {
                dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1;
            } else {
                trees.push(r);
            }
        }
        return { trees, rawCount: features.length, dropped };
    },

    async parseCount(raw) {
        const json = JSON.parse(raw);
        if (json.error) throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message}`);
        return json.count ?? 0;
    },
};
