/**
 * Shared client for collectie.gimbornarboretum.nl, the collection database
 * shared by four institutions: Nationaal Bomenmuseum Gimborn (VGA), Pinetum
 * de Dennenhorst (DENHT), Trompenburg Tuinen & Arboretum (TROMP), and Pinetum
 * Ter Borgh (TERBORGH). There is no API — this is a legacy ASP.NET WebForms +
 * Telerik RadControls app driven entirely by postbacks. See
 * cities/trompenburg.js (the first fetcher built against this site) for the
 * full reverse-engineering trail; this module factors out what's common to
 * fetching any one of the four institutions.
 *
 * Protocol:
 *   1. GET  Zoeken.aspx?type=wetensch          → cookie + initial ViewState/EventValidation
 *   2. POST __EVENTTARGET=cbArboreta           → selects the institution
 *   3. POST __EVENTTARGET=cbSoortGewas         → selects growth form (optional — some
 *                                                 institutions' manual search flow has
 *                                                 no such step; pass growthFormIndex: null)
 *   4. Per search term:
 *      a. POST __CALLBACK (Command:"LOD")      → autocomplete round-trip (required — the
 *                                                 site's own search box will not submit
 *                                                 without it; does not update ViewState)
 *      b. POST ctl00$Cp1$btnzoek="Zoek"        → results embedded as
 *                                                 init_map(zoom,lat,lon,"<CODE>",[markers])
 *
 * Every async postback response returns a *new* ViewState/EventValidation pair
 * (embedded as `|hiddenField|__VIEWSTATECOMPRESSED|<value>|`), which must be carried
 * into the next request — reusing a stale pair produces corrupted, inflated, or
 * truncated results without any error.
 *
 * The cbArboreta checkbox has no effect on which specimens the search actually
 * returns — confirmed empirically: selecting a different institution index for the
 * same term returns byte-identical results, only the map's cosmetic label differs.
 * Institution scoping instead relies on each institution's geographic bounding box
 * (the four institutions' specimens form four distinct, well-separated clusters).
 *
 * Coverage strategy: the search box does substring matching against each specimen's
 * full name (e.g. searching "Fagus" also matches "Nothofagus"). Rather than seed
 * search terms from registry.json (biased toward municipal street-tree genera —
 * these are specialist collections likely to include exotics registry.json won't
 * know about), callers fetch once per letter a–z. Every specimen name necessarily
 * contains at least one a–z letter, so the union of 26 searches is complete by
 * construction, with no dependency on any pre-existing genus list.
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { writeJSON, writeSQLite } from './writers.js';
import { drawProgress } from './progress.js';
import { processSpecies, getVernacularNl } from './species.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');

const HOST        = 'collectie.gimbornarboretum.nl';
const SEARCH_PATH = '/Publiek/Zoeken.aspx?type=wetensch';
const POST_PATH   = '/Publiek/Zoeken.aspx';
const ALPHABET    = 'abcdefghijklmnopqrstuvwxyz'.split('');
const REQUEST_DELAY_MS = 250; // politeness throttle between per-letter searches
const MAX_LIST_PAGES   = 100; // safety cap for --include-unmapped pagination

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Low-level HTTP ───────────────────────────────────────────────────────────

// The server (or a WAF in front of it) rejects requests that don't look like a
// real browser — a plain custom User-Agent with no Accept/Accept-Language/
// sec-ch-ua produced a generic error page even with an otherwise byte-identical,
// correctly-chained request. Confirmed by diffing against a literal HAR capture
// with only these headers added. Not spoofing anything beyond what any browser
// sends by default.
const BROWSER_HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,nl;q=0.7',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

function httpRequest(method, reqPath, body, cookie, ajax = true) {
    return new Promise((resolve, reject) => {
        const headers = { ...BROWSER_HEADERS };
        if (cookie) headers['Cookie'] = cookie;
        if (body != null) {
            headers['Content-Type']   = 'application/x-www-form-urlencoded; charset=UTF-8';
            headers['Content-Length'] = Buffer.byteLength(body);
            headers['Origin']  = `https://${HOST}`;
            headers['Referer'] = `https://${HOST}${SEARCH_PATH}`;
            headers['sec-fetch-dest'] = 'empty';
            headers['sec-fetch-mode'] = 'cors';
            headers['sec-fetch-site'] = 'same-origin';
            // Real async postbacks (UpdatePanel-driven: checkbox selects, Zoek, Lijst) send
            // these; the LOD autocomplete __CALLBACK does not — confirmed from a real HAR
            // capture. Sending them on a callback request causes a server-side 500.
            if (ajax) {
                headers['X-MicrosoftAjax'] = 'Delta=true';
                headers['X-Requested-With'] = 'XMLHttpRequest';
            }
        }
        const req = https.request({ hostname: HOST, path: reqPath, method, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const setCookie = res.headers['set-cookie'];
                resolve({
                    status: res.statusCode,
                    body:   Buffer.concat(chunks).toString('utf8'),
                    cookie: setCookie ? setCookie[0].split(';')[0] : cookie,
                });
            });
        });
        req.on('error', reject);
        if (body != null) req.write(body);
        req.end();
    });
}

// ── ViewState / EventValidation extraction ──────────────────────────────────

function extractInitialState(html) {
    const vsc = html.match(/id="__VIEWSTATECOMPRESSED" value="([^"]*)"/);
    const ev  = html.match(/id="__EVENTVALIDATION" value="([^"]*)"/);
    if (!vsc || !ev) throw new Error('Could not find __VIEWSTATECOMPRESSED/__EVENTVALIDATION — page layout may have changed.');
    return { viewStateCompressed: vsc[1], eventValidation: ev[1] };
}

// Async-postback ("delta") responses embed updated hidden fields as
// `|hiddenField|<name>|<value>|`. Values are base64/opaque and never contain
// a literal pipe, so a non-greedy [^|]* capture is safe without implementing
// the full MS AJAX length-prefixed framing.
function extractDeltaState(text, previous) {
    const vsc = text.match(/\|hiddenField\|__VIEWSTATECOMPRESSED\|([^|]*)\|/);
    const ev  = text.match(/\|hiddenField\|__EVENTVALIDATION\|([^|]*)\|/);
    // __CALLBACK (LOD autocomplete) responses aren't delta postbacks and carry no
    // state update — the caller keeps using whatever state it already had.
    return {
        viewStateCompressed: vsc ? vsc[1] : previous.viewStateCompressed,
        eventValidation:     ev  ? ev[1]  : previous.eventValidation,
    };
}

// ── Request field builders ──────────────────────────────────────────────────

// checkedIndex may be null (nothing checked — used when an institution's search
// flow has no growth-form step at all).
function clientListBox(checkedIndex) {
    return JSON.stringify({
        isEnabled: true, logEntries: [], selectedIndices: [],
        checkedIndices: checkedIndex == null ? [] : [checkedIndex],
        scrollPosition: 0,
    });
}

// The RadListBox "check" action is carried by __EVENTARGUMENT, not just by
// ClientState's checkedIndices — omitting it throws server-side (confirmed
// from a real capture; every earlier attempt was missing this).
function checkItemArgument(index) {
    return JSON.stringify({ type: 6, ItemIndex: index });
}

// "value" reflects a real, selected dropdown item's underlying key; it stays
// empty when the user only typed text without picking a suggestion (confirmed
// from a real capture — typed-only search is the mode this fetcher relies on).
function clientTaxa(term) {
    return JSON.stringify({ logEntries: [], value: '', text: term, enabled: true, checkedIndices: [], checkedItemsTextOverflows: false });
}

const RCBTAXA_PLACEHOLDER = 'Zoekterm (Geslacht Soort Cultivar)';

function clientButton(text, commandArgument = '') {
    return JSON.stringify({
        text, value: '', checked: false, target: '', navigateUrl: '', commandName: '',
        commandArgument, autoPostBack: true, selectedToggleStateIndex: 0,
        validationGroup: null, readOnly: false, primary: false, enabled: true,
    });
}

// The ?type=wetensch page (needed for the rcbtaxa botanical-name search box)
// renders the same control set — including all four institutions' "plattegrond"
// (site plan) buttons — regardless of which arboretum is selected. The
// btnplattegrondTROMP field name works fine even when a *different* institution
// is selected (verified: fetching VGA-labelled results through this exact field
// name succeeded), so there's no need to vary it per institution.
function baseFields(session, term, arboretumIndex, growthFormIndex) {
    return {
        'ctl00_rwm1_ClientState': '',
        'ctl00$ddltaal': 'Nederlands',
        'ctl00_ddltaal_ClientState': '',
        'ctl00_Cp1_cbArboreta_ClientState': clientListBox(arboretumIndex),
        'ctl00_Cp1_cbSoortGewas_ClientState': clientListBox(growthFormIndex),
        // Before any search box interaction, the field shows its placeholder text and
        // ClientState is genuinely empty (not a JSON blob) — confirmed from a real capture.
        'ctl00$Cp1$rcbtaxa': term ?? RCBTAXA_PLACEHOLDER,
        'ctl00_Cp1_rcbtaxa_ClientState': term != null ? clientTaxa(term) : '',
        'ctl00_Cp1_btnzoek_ClientState': clientButton('Zoek'),
        'ctl00_Cp1_btnplattegrondTROMP_ClientState': clientButton('Plattegrond Trompenburg Tuinen & Arboretum', 'TROMP'),
        'ctl00_Cp1_btnlijst_ClientState': clientButton('Lijst'),
        'ctl00_Cp1_btnafbeeldingen_ClientState': clientButton('Afbeeldingen overzicht'),
        'ctl00_Cp1_radwindowpostcard_ClientState': '',
        'ctl00_Cp1_radwindoworiginal_ClientState': '',
        'ctl00_Cp1_radwindowdetails_C_btnpdf_ClientState': '',
        'ctl00_Cp1_radwindowdetails_C_detaillist_ClientState': '',
        'ctl00_Cp1_radwindowdetails_ClientState': '',
        'ctl00_Cp1_radwindowgroot_ClientState': '',
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': '',
        '__VIEWSTATECOMPRESSED': session.viewStateCompressed,
        '__EVENTVALIDATION': session.eventValidation,
    };
}

function encodeForm(fields) {
    return Object.entries(fields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

async function post(fields, session, label = '', ajax = true) {
    const body = encodeForm(fields);
    const res  = await httpRequest('POST', POST_PATH, body, session.cookie, ajax);
    if (res.status !== 200) {
        throw new Error(`POST ${POST_PATH} [${label}] → HTTP ${res.status}\n${res.body.slice(0, 2000)}`);
    }
    return res;
}

// ── Session bootstrap ────────────────────────────────────────────────────────

async function bootstrapSession(arboretumIndex, growthFormIndex) {
    const getRes = await httpRequest('GET', SEARCH_PATH, null, null);
    if (getRes.status !== 200) throw new Error(`GET ${SEARCH_PATH} → HTTP ${getRes.status}`);
    let session = { cookie: getRes.cookie, ...extractInitialState(getRes.body) };

    // Select institution
    let res = await post({
        'ctl00$ScriptManager1': 'ctl00$ScriptManager1|ctl00$Cp1$cbArboreta',
        ...baseFields(session, null, arboretumIndex, growthFormIndex),
        '__EVENTTARGET': 'ctl00$Cp1$cbArboreta',
        '__EVENTARGUMENT': checkItemArgument(arboretumIndex),
        '__ASYNCPOST': 'true',
        'RadAJAXControlID': 'ctl00_ram',
    }, session, 'select arboretum');
    session = { cookie: res.cookie, ...extractDeltaState(res.body, session) };

    // Select growth form — some institutions' manual search flow has no such step
    if (growthFormIndex != null) {
        res = await post({
            'ctl00$ScriptManager1': 'ctl00$ScriptManager1|ctl00$Cp1$cbSoortGewas',
            ...baseFields(session, null, arboretumIndex, growthFormIndex),
            '__EVENTTARGET': 'ctl00$Cp1$cbSoortGewas',
            '__EVENTARGUMENT': checkItemArgument(growthFormIndex),
            '__ASYNCPOST': 'true',
            'RadAJAXControlID': 'ctl00_ram',
        }, session, 'select growth form');
        session = { cookie: res.cookie, ...extractDeltaState(res.body, session) };
    }

    return session;
}

// ── Search (map view — specimens with coordinates) ──────────────────────────

const MARKERS_RE = /init_map\([^,]*,[^,]*,[^,]*,"[A-Z]+",(\[[\s\S]*?\])\)/;

async function searchTerm(term, session, arboretumIndex, growthFormIndex) {
    // Autocomplete round-trip — required by the site; doesn't update ViewState.
    const callbackParam = JSON.stringify({
        Command: 'LOD', Text: term,
        ClientState: { value: '', text: '', enabled: true, logEntries: [], checkedIndices: [], checkedItemsTextOverflows: false },
        Context: { Text: term, NumberOfItems: 0 }, NumberOfItems: 0,
    });
    await post({
        ...baseFields(session, term, arboretumIndex, growthFormIndex),
        '__CALLBACKID': 'ctl00$Cp1$rcbtaxa',
        '__CALLBACKPARAM': callbackParam,
    }, session, `LOD callback "${term}"`, false);

    const res = await post({
        'ctl00$ScriptManager1': 'ctl00$ScriptManager1|ctl00$Cp1$btnzoek',
        ...baseFields(session, term, arboretumIndex, growthFormIndex),
        '__ASYNCPOST': 'true',
        'ctl00$Cp1$btnzoek': 'Zoek',
        'RadAJAXControlID': 'ctl00_ram',
    }, session, `Zoek "${term}"`);
    const nextSession = { cookie: res.cookie, ...extractDeltaState(res.body, session) };

    const m = res.body.match(MARKERS_RE);
    if (!m) {
        throw new Error(`Could not find init_map(...) markers array in Zoek response for "${term}"\n`
            + `has "init_map(": ${res.body.includes('init_map(')}\n`
            + `has "lblerror": ${(res.body.match(/lblerror"[^>]*>([^<]*)</) || [])[1] ?? '(none)'}\n`
            + `response snippet:\n${res.body.slice(0, 2000)}`);
    }
    const markers = JSON.parse(m[1]);
    return { markers, session: nextSession };
}

// ── List view (--include-unmapped: specimens with no coordinate) ───────────

function extractVirtualItemCount(text) {
    const m = text.match(/"VirtualItemCount":(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

// List rows: 8 <td> columns — thumbnail, "Toon details" link, Dutch name,
// full/botanical name, vaknummer, loopnummer, accession number, institution.
// No coordinates and no lceid (only resolvable by clicking through, which isn't
// attempted here). Best-effort / less thoroughly verified than the map path —
// pagination via the grid's CurrentPageIndex ClientState field is inferred, not
// confirmed against a real capture.
const ROW_RE = /<tr class="rg(?:Alt)?Row"[^>]*>\s*<td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><td[^>]*>([^<]*)<\/td><td>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g;

async function listRows(term, session, arboretumIndex, growthFormIndex, warn) {
    const rows = [];
    let currentSession = session;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const res = await post({
            'ctl00$ScriptManager1': 'ctl00$ScriptManager1|ctl00$Cp1$btnlijst',
            ...baseFields(currentSession, term, arboretumIndex, growthFormIndex),
            'ctl00_Cp1_grid_ClientState': JSON.stringify({ CurrentPageIndex: page }),
            '__ASYNCPOST': 'true',
            'ctl00$Cp1$btnlijst': 'Lijst',
            'RadAJAXControlID': 'ctl00_ram',
        }, currentSession, `List rows "${term}" page ${page}`);
        currentSession = { cookie: res.cookie, ...extractDeltaState(res.body, currentSession) };

        const total = extractVirtualItemCount(res.body);
        const pageRows = [...res.body.matchAll(ROW_RE)].map(m => ({
            name_vernacular: m[1].trim() || null,
            species:         m[2].trim(),
            vaknummer:       m[3].trim(),
            loopnummer:      m[4].trim(),
            id:              m[5].trim(),
        }));

        if (page === 0 && pageRows.length === 0 && total) {
            warn(`--include-unmapped: could not parse List rows for "${term}" (expected ${total}); skipping unmapped specimens for this term.`);
            break;
        }
        rows.push(...pageRows);
        if (pageRows.length === 0 || (total != null && rows.length >= total)) break;
    }
    return { rows, session: currentSession };
}

// ── Tree object mapping ──────────────────────────────────────────────────────

// Existing source vernacular names take priority; registry.json is only
// consulted to fill in what's missing.
function resolveVernacular(existing, binomial) {
    return existing || getVernacularNl(binomial);
}

// Returns null if processSpecies() drops the entry (matches overrides.js
// dropTerms — same rule every other city fetcher applies).
function markerToTree(marker, cityId, fetchedAt) {
    const resolved = processSpecies(marker.volledigenaam);
    if (!resolved) return null;
    return {
        city: cityId,
        lat: marker.latitude,
        lon: marker.longitude,
        id: String(marker.lceid),
        year_planted: null,
        name_vernacular: resolveVernacular(marker.volksnaam || null, resolved.species_binomial),
        species: marker.volledigenaam,
        species_binomial: resolved.species_binomial,
        species_cultivar: resolved.species_cultivar,
        neighbourhood: null,
        street: marker.vakenloopnummer || null,
        trunk_diameter: null,
        crown_spread: null,
        last_fetched: fetchedAt,
    };
}

function rowToTree(row, cityId, fetchedAt) {
    const resolved = processSpecies(row.species);
    if (!resolved) return null;
    return {
        city: cityId,
        lat: null,
        lon: null,
        id: row.id,
        year_planted: null,
        name_vernacular: resolveVernacular(row.name_vernacular, resolved.species_binomial),
        species: row.species,
        species_binomial: resolved.species_binomial,
        species_cultivar: resolved.species_cultivar,
        neighbourhood: null,
        street: `${row.vaknummer}-${row.loopnummer}`,
        trunk_diameter: null,
        crown_spread: null,
        last_fetched: fetchedAt,
    };
}

function withinBbox(lat, lon, bbox) {
    return lat >= bbox.latMin && lat <= bbox.latMax
        && lon >= bbox.lonMin && lon <= bbox.lonMax;
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * @param {object} institution
 * @param {string} institution.cityId - written to each tree's `city` field and used as the default output filename
 * @param {number} institution.arboretumIndex - index within cbArboreta (see registry note in cities/trompenburg.js)
 * @param {number|null} institution.growthFormIndex - index within cbSoortGewas ("WOODY" = 0), or null to skip that step entirely
 * @param {{latMin:number,latMax:number,lonMin:number,lonMax:number}} institution.bbox - geographic filter, since the arboretum checkbox itself has no effect on results
 * @param {boolean} [options.includeUnmapped]
 * @param {string|null} [options.letters] - restrict to these starting letters; a leading '\0' means "treat the rest as one exact term, don't split"
 */
export async function fetchCollection(institution, { includeUnmapped, letters } = {}) {
    const { cityId, arboretumIndex, growthFormIndex, bbox } = institution;
    const fetchedAt = new Date().toISOString();
    process.stderr.write(`[${cityId}] Establishing session...\n`);
    let session = await bootstrapSession(arboretumIndex, growthFormIndex);

    const byId = new Map();
    const mappedKeys = new Set(); // `${vakenloopnummer}|${volledigenaam}` — used to dedupe unmapped rows against mapped specimens
    let droppedOtherArboretum = 0;
    let droppedSpecies = 0;

    const terms = letters
        ? (letters.startsWith('\0') ? [letters.slice(1)] : letters.split(''))
        : ALPHABET;

    // Map (Zoek) and List (Lijst) requests appear to leave the server in different
    // view-mode states — interleaving them within one session chain corrupted later
    // requests. Collect all mapped specimens first, in one uninterrupted Zoek-only
    // session chain, before touching the List view for anything.
    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        drawProgress(i, terms.length);

        const { markers, session: s1 } = await searchTerm(term, session, arboretumIndex, growthFormIndex);
        session = s1;
        for (const marker of markers) {
            if (!withinBbox(marker.latitude, marker.longitude, bbox)) { droppedOtherArboretum++; continue; }
            const tree = markerToTree(marker, cityId, fetchedAt);
            if (!tree) { droppedSpecies++; continue; }
            byId.set(String(marker.lceid), tree);
            mappedKeys.add(`${marker.vakenloopnummer}|${marker.volledigenaam}`);
        }

        await sleep(REQUEST_DELAY_MS);
    }
    drawProgress(terms.length, terms.length);

    if (includeUnmapped) {
        process.stderr.write(`[${cityId}] Establishing a fresh session for List-view (unmapped specimen) pass...\n`);
        session = await bootstrapSession(arboretumIndex, growthFormIndex);
        for (let i = 0; i < terms.length; i++) {
            const term = terms[i];
            drawProgress(i, terms.length);
            const { rows, session: s2 } = await listRows(term, session, arboretumIndex, growthFormIndex, msg => process.stderr.write(`[${cityId}] ${msg}\n`));
            session = s2;
            for (const row of rows) {
                const key = `${row.vaknummer}-${row.loopnummer}|${row.species}`;
                if (mappedKeys.has(key)) continue;
                if (byId.has(row.id)) continue;
                const tree = rowToTree(row, cityId, fetchedAt);
                if (!tree) { droppedSpecies++; continue; }
                byId.set(`unmapped:${row.id}`, tree);
            }
            await sleep(REQUEST_DELAY_MS);
        }
        drawProgress(terms.length, terms.length);
    }

    let trees = [...byId.values()];
    if (!includeUnmapped) {
        trees = trees.filter(t => t.lat != null && t.lon != null);
    }

    const unmappedCount = trees.filter(t => t.lat == null).length;
    const mappedCount   = trees.length - unmappedCount;
    process.stderr.write(`[${cityId}] Got ${trees.length} trees (${mappedCount} with coordinates${includeUnmapped ? `, ${unmappedCount} without` : ''}).\n`);
    if (droppedOtherArboretum > 0 || droppedSpecies > 0) {
        const total = droppedOtherArboretum + droppedSpecies;
        process.stderr.write(`[${cityId}] Dropped ${total} entries:\n`);
        if (droppedOtherArboretum > 0) process.stderr.write(`  other_arboretum: ${droppedOtherArboretum}\n`);
        if (droppedSpecies > 0)        process.stderr.write(`  filtered_species: ${droppedSpecies}\n`);
    }

    return trees;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { format: 'sqlite', output: null, includeUnmapped: false, letters: null, term: null, dry: false };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--format':          args.format = argv[++i]; break;
            case '--output':          args.output = argv[++i]; break;
            case '--include-unmapped': args.includeUnmapped = true; break;
            case '--letters':         args.letters = argv[++i]; break;
            case '--term':            args.term = argv[++i]; break; // debug: single exact search term, not letter-split
            case '-d': case '--dry':  args.dry = true; break;
        }
    }
    return args;
}

/** Entry point for a `cities/<id>.js` wrapper — parses argv, fetches, writes output. */
export async function runCli(institution) {
    const args = parseArgs(process.argv.slice(2));
    const letters = args.term ? '\0' + args.term : args.letters; // '\0' prefix signals "don't split"
    const trees = await fetchCollection(institution, { includeUnmapped: args.includeUnmapped, letters });

    if (args.dry) {
        process.stdout.write(JSON.stringify(trees, null, 2) + '\n');
        return;
    }

    const outFile = args.output ?? path.join(DATA_DIR, args.format === 'json' ? `${institution.cityId}.json` : `${institution.cityId}.db`);
    if (args.format === 'json') {
        await writeJSON(trees, outFile);
    } else if (args.format === 'sqlite') {
        await writeSQLite(trees, outFile);
    } else {
        throw new Error(`Unknown format "${args.format}". Use "json" or "sqlite".`);
    }
    process.stderr.write(`[${institution.cityId}] Written to ${outFile}\n`);
}
