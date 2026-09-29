<?php
/**
 * Trees API — map view over the national tree database
 *
 * Data (built by open-data-fetcher/tools/build-db.js):
 *   data/trees.db   trees of every source + precomputed cluster/species/source pyramids
 *   data/meta.db    sources, species dictionary, build version
 *   data/issues.db  user-reported issues (written by this API, never by the build)
 *
 * Endpoints:
 *   GET  /api/meta                                   sources, species dictionary, build version
 *   POST /api/tiles   {"z","tiles":[[x,y],...],"species"?}   per tile: clusters or slim trees
 *   GET  /api/species?z=&x0=&x1=&y0=&y1=             [[speciesId, count]] for a tile range
 *   GET  /api/tree?source=&id=                       full details of one tree
 *   POST /api/trees/details  {"trees":[[source,id],...]}     details of several trees
 *   POST /api/flag, GET /api/issues, POST /api/issues/resolve
 *   GET  /api/health
 */

// Zoom range of the precomputed pyramids — must match build-db.js.
define('MIN_PYRAMID_ZOOM', 5);
define('MAX_PYRAMID_ZOOM', 17);
// Species-filtered clusters are precomputed up to this zoom (species_cell), bucketed live above it.
define('MAX_SPECIES_CELL_ZOOM', 11);
// A 256 px tile with more trees than this is sent as clusters (64 px cells) instead of trees.
define('TILE_TREE_LIMIT', 500);
define('CELL_PX', 64);
define('MAX_TILES_PER_REQUEST', 100);
define('MAX_SPECIES_TILES', 400);
define('MAX_DETAILS_PER_REQUEST', 200);

// Origins allowed to call the API from a browser. Add your production domain here.
define('ALLOWED_ORIGINS', [
    'http://localhost:5173',   // Vite dev server
    'http://localhost:8000',   // PHP built-in dev server
    'https://boxofchocolates.nl',
]);

if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) ob_start('ob_gzhandler');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, If-None-Match');
cors_origin();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Router ────────────────────────────────────────────────────────────────────

try {
    $segment = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    $route   = '/' . ltrim(substr($segment, strrpos($segment, '/api') + 4), '/');

    match ($route) {
        '/meta'              => handle_meta(),
        '/tiles'             => handle_tiles(),
        '/species'           => handle_species(),
        '/tree'              => handle_tree(),
        '/trees/details'     => handle_trees_details(),
        '/health'            => handle_health(),
        '/flag'              => handle_flag(),
        '/issues'            => handle_issues_get(),
        '/issues/resolve'    => handle_issues_resolve(),
        default              => respond(404, ['error' => 'Unknown endpoint']),
    };
} catch (Throwable $e) {
    respond(500, ['error' => $e->getMessage(), 'file' => basename($e->getFile()), 'line' => $e->getLine()]);
}

// ── Databases ─────────────────────────────────────────────────────────────────

function open_readonly(string $file): PDO
{
    $path = __DIR__ . '/data/' . $file;
    if (!file_exists($path)) {
        respond(503, ['error' => "{$file} not found. Run the build: cd open-data-fetcher && npm run build-db"]);
    }
    return new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::SQLITE_ATTR_OPEN_FLAGS  => PDO::SQLITE_OPEN_READONLY,
    ]);
}

function trees_db(): PDO
{
    static $db;
    return $db ??= open_readonly('trees.db');
}

function meta_db(): PDO
{
    static $db;
    return $db ??= open_readonly('meta.db');
}

function build_version(): string
{
    static $version;
    return $version ??= (string) meta_db()->query('SELECT version FROM build')->fetchColumn();
}

/** Source index → source id, and the reverse. */
function source_ids(): array
{
    static $ids;
    if ($ids !== null) return $ids;
    $ids = [];
    foreach (meta_db()->query('SELECT idx, id FROM sources') as $r) $ids[(int) $r['idx']] = $r['id'];
    return $ids;
}

function source_idx(string $id): ?int
{
    $idx = array_search($id, source_ids(), true);
    return $idx === false ? null : $idx;
}

// ── Web-mercator tile math ────────────────────────────────────────────────────

/** Bounds of tile (z, x, y) in degrees: [s, n, w, e]. */
function tile_bounds(int $z, int $x, int $y): array
{
    $n2 = 2 ** $z;
    $lat = fn(int $ty) => rad2deg(atan(sinh(M_PI * (1 - 2 * $ty / $n2))));
    return [$lat($y + 1), $lat($y), $x / $n2 * 360 - 180, ($x + 1) / $n2 * 360 - 180];
}

/** World pixel coordinates at zoom z. */
function mercator_px(float $lat, float $lon, int $z): array
{
    $scale = 256 * 2 ** $z;
    $r = deg2rad($lat);
    return [
        ($lon + 180) / 360 * $scale,
        (1 - log(tan($r) + 1 / cos($r)) / M_PI) / 2 * $scale,
    ];
}

/**
 * SQL condition for points inside a tile. Floats are embedded rather than bound: PDO binds
 * them as TEXT, which breaks comparisons against REAL columns in SQLite. Half-open on the
 * tile's east and south edges so a tree on a shared edge belongs to exactly one tile.
 */
function tile_condition(int $z, int $x, int $y): string
{
    [$s, $n, $w, $e] = array_map(fn($v) => sprintf('%.9F', $v), tile_bounds($z, $x, $y));
    return "lat > {$s} AND lat <= {$n} AND lon >= {$w} AND lon < {$e}";
}

function read_json_body(): array
{
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(400, ['error' => 'Invalid JSON body']);
    return $body;
}

function int_param(string $name, int $min, int $max): int
{
    $v = filter_input(INPUT_GET, $name, FILTER_VALIDATE_INT);
    if ($v === false || $v === null || $v < $min || $v > $max) {
        respond(400, ['error' => "Query param {$name} must be an integer in [{$min}, {$max}]"]);
    }
    return $v;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handle_meta(): void
{
    $version = build_version();
    $etag    = '"' . $version . '"';
    header('ETag: ' . $etag);
    header('Cache-Control: no-cache');
    if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        // A 304 has no body: drop the gzip buffer, or it still announces Content-Encoding on
        // an empty chunked response, which proxies (e.g. Vite's) turn into an error.
        while (ob_get_level() > 0) ob_end_clean();
        header_remove('Content-Encoding');
        header_remove('Content-Type');
        http_response_code(304);
        exit;
    }

    $sources = [];
    foreach (meta_db()->query('SELECT * FROM sources ORDER BY idx') as $r) {
        $source = [
            'id'         => $r['id'],
            'name'       => $r['name'],
            'type'       => $r['type'],
            'center'     => [(float) $r['center_lat'], (float) $r['center_lon']],
            'bbox'       => ['s' => (float) $r['s'], 'n' => (float) $r['n'], 'w' => (float) $r['w'], 'e' => (float) $r['e']],
            'tree_count' => (int) $r['tree_count'],
            'meta'       => array_merge(json_decode($r['meta_json'], true) ?: [], ['lastFetched' => $r['last_fetched']]),
        ];
        if ($r['cluster_disable_zoom'] !== null) $source['clusterDisableZoom'] = (int) $r['cluster_disable_zoom'];
        $sources[] = $source;
    }

    $species = [];
    foreach (meta_db()->query('SELECT * FROM species ORDER BY id') as $r) {
        $names = array_filter(['nl' => $r['nl'], 'en' => $r['en'], 'de' => $r['de'], 'fr' => $r['fr']], fn($v) => $v !== null && $v !== '');
        $species[] = [(int) $r['id'], $r['key'], $r['binomial'], (object) $names];
    }

    respond(200, ['version' => $version, 'sources' => $sources, 'species' => $species]);
}

/**
 * Per requested tile: tree count, trees per source, and either
 *   "clusters": [[lat, lon, count], ...]                  when the tile holds > TILE_TREE_LIMIT trees
 *   "trees":    {sourceId: [[id, lat, lon, speciesId], ...]} otherwise
 * With "species", only trees of that species id are counted, clustered and returned.
 */
function handle_tiles(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Method not allowed']);
    $body = read_json_body();

    $z = $body['z'] ?? null;
    if (!is_int($z) || $z < MIN_PYRAMID_ZOOM || $z > 22) {
        respond(400, ['error' => 'z must be an integer in [' . MIN_PYRAMID_ZOOM . ', 22]']);
    }
    $tiles = $body['tiles'] ?? null;
    if (!is_array($tiles) || count($tiles) === 0 || count($tiles) > MAX_TILES_PER_REQUEST) {
        respond(400, ['error' => 'tiles must be a non-empty array of at most ' . MAX_TILES_PER_REQUEST . ' [x, y] pairs']);
    }
    $species = $body['species'] ?? null;
    if ($species !== null && !is_int($species)) respond(400, ['error' => 'species must be a species id']);

    $out = [];
    foreach ($tiles as $i => $t) {
        if (!is_array($t) || count($t) !== 2 || !is_int($t[0]) || !is_int($t[1])) {
            respond(400, ['error' => "tiles[{$i}] must be [x, y] integers"]);
        }
        $out[] = tile_payload($z, $t[0], $t[1], $species);
    }
    respond(200, ['version' => build_version(), 'tiles' => $out]);
}

function tile_payload(int $z, int $x, int $y, ?int $species): array
{
    $db   = trees_db();
    $ids  = source_ids();
    $tile = ['x' => $x, 'y' => $y];

    // Tree count (for the clusters/trees decision) and trees per source, from the pyramids.
    $count = null;
    if ($z <= MAX_PYRAMID_ZOOM) {
        $sources = [];
        $stmt = $db->prepare('SELECT source_idx, count FROM tile_source WHERE z = ? AND x = ? AND y = ?');
        $stmt->execute([$z, $x, $y]);
        foreach ($stmt as $r) $sources[$ids[(int) $r['source_idx']]] = (int) $r['count'];
        $tile['sources'] = (object) $sources;

        if ($species === null) {
            $count = array_sum($sources);
        } else {
            $stmt = $db->prepare('SELECT count FROM tile_species WHERE z = ? AND x = ? AND y = ? AND species_id = ?');
            $stmt->execute([$z, $x, $y, $species]);
            $count = (int) $stmt->fetchColumn();
        }
        $tile['count'] = $count;
        if ($count === 0) { $tile['trees'] = (object) []; return $tile; }
    }

    $where = tile_condition($z, $x, $y) . ($species !== null ? ' AND species_id = ' . $species : '');

    if ($count !== null && $count > TILE_TREE_LIMIT) {
        $tile['clusters'] = match (true) {
            $species === null               => precomputed_clusters($z, $x, $y),
            $z <= MAX_SPECIES_CELL_ZOOM     => precomputed_species_clusters($z, $x, $y, $species),
            default                         => live_clusters($z, $where),
        };
        return $tile;
    }

    $trees = [];
    $total = 0;
    $bySource = [];
    foreach ($db->query("SELECT source_idx, id, lat, lon, species_id FROM trees WHERE {$where}", PDO::FETCH_NUM) as [$src, $id, $lat, $lon, $sp]) {
        $sid = $ids[(int) $src];
        $trees[$sid][] = [$id, round((float) $lat, 6), round((float) $lon, 6), (int) $sp];
        $bySource[$sid] = ($bySource[$sid] ?? 0) + 1;
        $total++;
    }
    if ($count === null) {
        // Beyond the pyramids: counts come from the trees themselves.
        $tile['count']   = $total;
        $tile['sources'] = (object) $bySource;
    }
    $tile['trees'] = (object) $trees;
    return $tile;
}

function precomputed_clusters(int $z, int $x, int $y): array
{
    $per  = 256 / CELL_PX;
    $stmt = trees_db()->prepare('SELECT lat, lon, count FROM cluster_cell
                                 WHERE z = ? AND cx BETWEEN ? AND ? AND cy BETWEEN ? AND ?');
    $stmt->execute([$z, $x * $per, $x * $per + $per - 1, $y * $per, $y * $per + $per - 1]);
    return array_map(fn($r) => [(float) $r['lat'], (float) $r['lon'], (int) $r['count']], $stmt->fetchAll());
}

function precomputed_species_clusters(int $z, int $x, int $y, int $species): array
{
    $per  = 256 / CELL_PX;
    $stmt = trees_db()->prepare('SELECT lat, lon, count FROM species_cell
                                 WHERE z = ? AND species_id = ? AND cx BETWEEN ? AND ? AND cy BETWEEN ? AND ?');
    $stmt->execute([$z, $species, $x * $per, $x * $per + $per - 1, $y * $per, $y * $per + $per - 1]);
    return array_map(fn($r) => [(float) $r['lat'], (float) $r['lon'], (int) $r['count']], $stmt->fetchAll());
}

/** Clusters for a species filter above MAX_SPECIES_CELL_ZOOM, bucketed on the fly. */
function live_clusters(int $z, string $where): array
{
    $cells = [];
    foreach (trees_db()->query("SELECT lat, lon FROM trees WHERE {$where}", PDO::FETCH_NUM) as [$lat, $lon]) {
        [$px, $py] = mercator_px((float) $lat, (float) $lon, $z);
        $key = intdiv((int) $px, CELL_PX) . ':' . intdiv((int) $py, CELL_PX);
        $c = &$cells[$key];
        $c ??= [0, 0.0, 0.0];
        $c[0]++; $c[1] += $lat; $c[2] += $lon;
        unset($c);
    }
    return array_values(array_map(fn($c) => [round($c[1] / $c[0], 6), round($c[2] / $c[0], 6), $c[0]], $cells));
}

/** Species in a tile range at zoom z, most common first: [[speciesId, count], ...]. */
function handle_species(): void
{
    $z  = int_param('z', MIN_PYRAMID_ZOOM, 30);
    $zp = min($z, MAX_PYRAMID_ZOOM);
    $x0 = int_param('x0', 0, 2 ** $z - 1); $x1 = int_param('x1', $x0, 2 ** $z - 1);
    $y0 = int_param('y0', 0, 2 ** $z - 1); $y1 = int_param('y1', $y0, 2 ** $z - 1);

    // Above the pyramids, widen the range to the enclosing tiles at MAX_PYRAMID_ZOOM.
    $shift = $z - $zp;
    $x0 >>= $shift; $x1 >>= $shift; $y0 >>= $shift; $y1 >>= $shift;
    if (($x1 - $x0 + 1) * ($y1 - $y0 + 1) > MAX_SPECIES_TILES) {
        respond(400, ['error' => 'Tile range too large; at most ' . MAX_SPECIES_TILES . ' tiles']);
    }

    $stmt = trees_db()->prepare('SELECT species_id, SUM(count) AS n FROM tile_species
                                 WHERE z = ? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?
                                 GROUP BY species_id ORDER BY n DESC');
    $stmt->execute([$zp, $x0, $x1, $y0, $y1]);
    respond(200, array_map(fn($r) => [(int) $r['species_id'], (int) $r['n']], $stmt->fetchAll()));
}

function handle_tree(): void
{
    $source = trim($_GET['source'] ?? '');
    $id     = (string) ($_GET['id'] ?? '');
    if ($source === '' || $id === '') respond(400, ['error' => 'Required query params: source, id']);
    $rows = tree_details([[$source, $id]]);
    if (!$rows) respond(404, ['error' => 'Tree not found']);
    respond(200, $rows[0]);
}

function handle_trees_details(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Method not allowed']);
    $keys = read_json_body()['trees'] ?? null;
    if (!is_array($keys) || count($keys) > MAX_DETAILS_PER_REQUEST) {
        respond(400, ['error' => 'trees must be an array of at most ' . MAX_DETAILS_PER_REQUEST . ' [source, id] pairs']);
    }
    respond(200, tree_details($keys));
}

/** Details for [source, id] pairs; unknown pairs are skipped. */
function tree_details(array $keys): array
{
    $stmt = trees_db()->prepare('SELECT * FROM trees WHERE source_idx = ? AND id = ?');
    $rows = [];
    foreach ($keys as $k) {
        if (!is_array($k) || count($k) !== 2) continue;
        $idx = source_idx((string) $k[0]);
        if ($idx === null) continue;
        $stmt->execute([$idx, (string) $k[1]]);
        $r = $stmt->fetch();
        if (!$r) continue;
        $rows[] = [
            'source'           => (string) $k[0],
            'id'               => $r['id'],
            'lat'              => (float) $r['lat'],
            'lon'              => (float) $r['lon'],
            'species_id'       => (int) $r['species_id'],
            'species'          => $r['species'],
            'species_cultivar' => $r['species_cultivar'],
            'year_planted'     => $r['year_planted'],
            'neighbourhood'    => $r['neighbourhood'],
            'street'           => $r['street'],
            'trunk_diameter'   => is_numeric($r['trunk_diameter']) ? (float) $r['trunk_diameter'] : null,
            'crown_spread'     => is_numeric($r['crown_spread'])   ? (float) $r['crown_spread']   : null,
        ];
    }
    return $rows;
}

function handle_health(): void
{
    $check = function (callable $fn) {
        try { return ['status' => 'ok'] + $fn(); }
        catch (Throwable $e) { return ['status' => 'error', 'message' => $e->getMessage()]; }
    };
    respond(200, [
        'trees' => $check(fn() => ['trees' => (int) trees_db()->query('SELECT COUNT(*) FROM trees')->fetchColumn()]),
        'meta'  => $check(fn() => [
            'version' => build_version(),
            'sources' => (int) meta_db()->query('SELECT COUNT(*) FROM sources')->fetchColumn(),
            'species' => (int) meta_db()->query('SELECT COUNT(*) FROM species')->fetchColumn(),
        ]),
    ]);
}

function handle_flag(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Method not allowed']);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(400, ['error' => 'Invalid JSON body']);

    $type  = trim((string) ($body['type'] ?? ''));
    $flags = is_array($body['flags'] ?? null) ? array_values(array_filter(array_map('strval', $body['flags']))) : [];
    $note  = trim((string) ($body['note'] ?? '')) ?: null;
    $now   = (new DateTime('now', new DateTimeZone('Europe/Amsterdam')))->format('Y-m-d H:i:s');
    $db    = issues_db();

    if ($type === 'tree') {
        $city    = trim((string) ($body['city']    ?? ''));
        $tree_id = trim((string) ($body['tree_id'] ?? ''));
        if ($city === '' || $tree_id === '') respond(400, ['error' => 'city and tree_id required']);

        $lat     = is_numeric($body['lat'] ?? null) ? (float) $body['lat'] : null;
        $lon     = is_numeric($body['lon'] ?? null) ? (float) $body['lon'] : null;
        $bin     = trim((string) ($body['species_binomial'] ?? '')) ?: null;
        $dutch   = trim((string) ($body['name_vernacular']  ?? '')) ?: null;
        $street  = trim((string) ($body['street']           ?? '')) ?: null;

        $existing = $db->prepare('SELECT created_at FROM tree_issues WHERE city=? AND tree_id=?');
        $existing->execute([$city, $tree_id]);
        $row = $existing->fetch();

        if ($row) {
            $db->prepare('UPDATE tree_issues SET lat=?,lon=?,species_binomial=?,name_vernacular=?,street=?,flags=?,note=?,updated_at=? WHERE city=? AND tree_id=?')
               ->execute([$lat,$lon,$bin,$dutch,$street,json_encode($flags),$note,$now,$city,$tree_id]);
        } else {
            $db->prepare('INSERT INTO tree_issues (city,tree_id,lat,lon,species_binomial,name_vernacular,street,flags,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([$city,$tree_id,$lat,$lon,$bin,$dutch,$street,json_encode($flags),$note,$now,$now]);
        }

    } elseif ($type === 'species') {
        $bin = trim((string) ($body['species_binomial'] ?? ''));
        if ($bin === '') respond(400, ['error' => 'species_binomial required']);

        $dutch = trim((string) ($body['name_vernacular'] ?? '')) ?: null;

        $existing = $db->prepare('SELECT created_at FROM species_issues WHERE species_binomial=?');
        $existing->execute([$bin]);
        $row = $existing->fetch();

        if ($row) {
            $db->prepare('UPDATE species_issues SET name_vernacular=?,flags=?,note=?,updated_at=? WHERE species_binomial=?')
               ->execute([$dutch,json_encode($flags),$note,$now,$bin]);
        } else {
            $db->prepare('INSERT INTO species_issues (species_binomial,name_vernacular,flags,note,created_at,updated_at) VALUES (?,?,?,?,?,?)')
               ->execute([$bin,$dutch,json_encode($flags),$note,$now,$now]);
        }
    } else {
        respond(400, ['error' => 'type must be "tree" or "species"']);
    }

    respond(200, ['ok' => true]);
}

function handle_issues_get(): void
{
    $db      = issues_db();
    $trees   = $db->query('SELECT * FROM tree_issues ORDER BY updated_at DESC')->fetchAll();
    $species = $db->query('SELECT * FROM species_issues ORDER BY updated_at DESC')->fetchAll();

    respond(200, [
        'trees'   => array_map(fn($r) => array_merge($r, [
            'lat'   => $r['lat']  !== null ? (float) $r['lat']  : null,
            'lon'   => $r['lon']  !== null ? (float) $r['lon']  : null,
            'flags' => json_decode($r['flags'], true),
        ]), $trees),
        'species' => array_map(fn($r) => array_merge($r, [
            'flags' => json_decode($r['flags'], true),
        ]), $species),
    ]);
}

function handle_issues_resolve(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Method not allowed']);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(400, ['error' => 'Invalid JSON body']);

    $type = trim((string) ($body['type'] ?? ''));
    $db   = issues_db();

    if ($type === 'tree') {
        $city    = trim((string) ($body['city']    ?? ''));
        $tree_id = trim((string) ($body['tree_id'] ?? ''));
        if ($city === '' || $tree_id === '') respond(400, ['error' => 'city and tree_id required']);
        $db->prepare('DELETE FROM tree_issues WHERE city=? AND tree_id=?')->execute([$city, $tree_id]);
    } elseif ($type === 'species') {
        $bin = trim((string) ($body['species_binomial'] ?? ''));
        if ($bin === '') respond(400, ['error' => 'species_binomial required']);
        $db->prepare('DELETE FROM species_issues WHERE species_binomial=?')->execute([$bin]);
    } else {
        respond(400, ['error' => 'type must be "tree" or "species"']);
    }

    respond(200, ['ok' => true]);
}

// ── Issues database ───────────────────────────────────────────────────────────

function issues_db(): PDO
{
    static $db;
    if ($db !== null) return $db;

    @mkdir(__DIR__ . '/data', 0755, true);
    $path = __DIR__ . '/data/issues.db';
    $db   = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('CREATE TABLE IF NOT EXISTS tree_issues (
        city             TEXT NOT NULL,
        tree_id          TEXT NOT NULL,
        lat              REAL,
        lon              REAL,
        species_binomial TEXT,
        name_vernacular  TEXT,
        street           TEXT,
        flags            TEXT NOT NULL DEFAULT \'[]\',
        note             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        PRIMARY KEY (city, tree_id)
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS species_issues (
        species_binomial TEXT NOT NULL PRIMARY KEY,
        name_vernacular  TEXT,
        flags            TEXT NOT NULL DEFAULT \'[]\',
        note             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    )');
    // Migrate existing issues.db if it still has the old column name
    try {
        $db->exec('ALTER TABLE tree_issues    RENAME COLUMN name_indigenous TO name_vernacular');
        $db->exec('ALTER TABLE species_issues RENAME COLUMN name_indigenous TO name_vernacular');
    } catch (Throwable) {
        // Column already renamed or doesn't exist — safe to ignore
    }
    return $db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cors_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if ($origin === null) return; // same-origin request or non-browser client — allow
    if (!in_array($origin, ALLOWED_ORIGINS, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Origin not allowed']);
        exit;
    }
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}

function respond(int $status, mixed $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
