<?php
/**
 * Trees API — multi-city
 *
 * Endpoints:
 *   GET  /api/cities
 *   GET  /api/trees?city=&s=&n=&w=&e=[&species=][&strict=1][&limit=]
 *   POST /api/trees  body: {"city","bboxes":[{"s","n","w","e"},...],"limit"?,"species"?,"strict"?}
 *   GET  /api/species?city=[&q=][&strict=1]
 *   GET  /api/health
 */

define('DEFAULT_LIMIT', 500);
define('MAX_LIMIT',     20000);

// Origins allowed to call the API from a browser. Add your production domain here.
define('ALLOWED_ORIGINS', [
    'http://localhost:5173',   // Vite dev server
    'http://localhost:8000',   // PHP built-in dev server
    'https://boxofchocolates.nl',
]);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
cors_origin();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Router ────────────────────────────────────────────────────────────────────

try {
    $segment = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    $route   = '/' . ltrim(substr($segment, strrpos($segment, '/api') + 4), '/');
    $method  = $_SERVER['REQUEST_METHOD'];

    match ($route) {
        '/cities'            => handle_cities(),
        '/trees'             => $method === 'POST' ? handle_trees_post() : handle_trees_get(),
        '/species'           => handle_species(),
        '/vernacular-names'  => handle_vernacular_names(),
        '/health'            => handle_health(),
        '/flag'              => handle_flag(),
        '/issues'            => handle_issues_get(),
        '/issues/resolve'    => handle_issues_resolve(),
        default              => respond(404, ['error' => 'Unknown endpoint']),
    };
} catch (Throwable $e) {
    respond(500, ['error' => $e->getMessage(), 'file' => basename($e->getFile()), 'line' => $e->getLine()]);
}

// ── City registry ─────────────────────────────────────────────────────────────

function load_cities(): array
{
    static $cities;
    if ($cities !== null) return $cities;
    $path = __DIR__ . '/cities.json';
    if (!file_exists($path)) respond(503, ['error' => 'cities.json not found']);
    $raw    = json_decode(file_get_contents($path), true);
    $margin = 0.01;
    $cities = [];
    foreach ($raw as $city) {
        $dbPath = __DIR__ . '/data/' . $city['id'] . '.db';
        if (file_exists($dbPath)) {
            $row = db($city['id'])
                ->query('SELECT MIN(lat) AS s, MAX(lat) AS n, MIN(lon) AS w, MAX(lon) AS e FROM trees')
                ->fetch();
            $city['bbox'] = [
                's' => (float) $row['s'] - $margin,
                'n' => (float) $row['n'] + $margin,
                'w' => (float) $row['w'] - $margin,
                'e' => (float) $row['e'] + $margin,
            ];
            $city['tree_count'] = (int) db($city['id'])
                ->query('SELECT COUNT(*) FROM trees')
                ->fetchColumn();
            $city['has_data'] = true;
            $city['meta']['lastFetched'] = date('Y-m-d', filemtime($dbPath));
        } else {
            // No database yet — provide a synthetic bbox so clients don't crash
            $city['bbox'] = [
                's' => $city['center'][0] - 0.15,
                'n' => $city['center'][0] + 0.15,
                'w' => $city['center'][1] - 0.20,
                'e' => $city['center'][1] + 0.20,
            ];
            $city['tree_count'] = 0;
            $city['has_data']   = false;
        }
        $cities[] = $city;
    }
    return $cities;
}

function validate_city(string $city): void
{
    $ids = array_column(load_cities(), 'id');
    if (!in_array($city, $ids, true)) {
        respond(400, ['error' => "Unknown city: \"{$city}\". Available: " . implode(', ', $ids)]);
    }
}

function validate_city_data(string $city): void
{
    validate_city($city);
    foreach (load_cities() as $c) {
        if ($c['id'] === $city && !($c['has_data'] ?? true)) {
            respond(404, ['error' => "No tree data available yet for \"{$city}\". Run the fetcher first."]);
        }
    }
}

// ── Database ──────────────────────────────────────────────────────────────────

function db(string $city): PDO
{
    static $pool = [];
    if (isset($pool[$city])) return $pool[$city];
    $path = __DIR__ . '/data/' . $city . '.db';
    if (!file_exists($path)) {
        respond(503, ['error' => "Database not found for city \"{$city}\". Run the fetcher first."]);
    }
    $pool[$city] = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pool[$city];
}

/**
 * Curated Dutch vernacular name overrides, keyed by uppercase species_binomial.
 * Returns an empty array if vernacular-nl.db is not present.
 */
function vernacular_overrides(): array
{
    static $map;
    if ($map !== null) return $map;

    $path = __DIR__ . '/data/vernacular-nl.db';
    if (!file_exists($path)) { $map = []; return $map; }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $map = [];
    foreach ($pdo->query('SELECT species_binomial, name_vernacular, name_vernacular_alt, source FROM vernacular_nl') as $row) {
        $map[strtoupper($row['species_binomial'])] = [
            'name_vernacular'     => $row['name_vernacular'],
            'name_vernacular_alt' => $row['name_vernacular_alt'],
            'source'              => $row['source'],
        ];
    }
    return $map;
}

/**
 * iNaturalist base vernacular names for all languages, keyed by uppercase species_binomial.
 * Returns an empty array if vernacular-base.db is not present.
 */
function vernacular_base(): array
{
    static $map;
    if ($map !== null) return $map;

    $path = __DIR__ . '/data/vernacular-base.db';
    if (!file_exists($path)) { $map = []; return $map; }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $map = [];
    foreach ($pdo->query('SELECT species_binomial, inat_id, nl, en, de, fr FROM vernacular_base') as $row) {
        $map[strtoupper($row['species_binomial'])] = [
            'inat_id' => $row['inat_id'],
            'nl'      => $row['nl'],
            'en'      => $row['en'],
            'de'      => $row['de'],
            'fr'      => $row['fr'],
        ];
    }
    return $map;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handle_cities(): void
{
    respond(200, load_cities());
}

function handle_trees_get(): void
{
    $city = trim($_GET['city'] ?? '');
    if ($city === '') respond(400, ['error' => 'Required query param: city']);
    validate_city_data($city);

    $s = filter_input(INPUT_GET, 's', FILTER_VALIDATE_FLOAT);
    $n = filter_input(INPUT_GET, 'n', FILTER_VALIDATE_FLOAT);
    $w = filter_input(INPUT_GET, 'w', FILTER_VALIDATE_FLOAT);
    $e = filter_input(INPUT_GET, 'e', FILTER_VALIDATE_FLOAT);

    if ($s === false || $n === false || $w === false || $e === false
        || $s === null || $n === null || $w === null || $e === null) {
        respond(400, ['error' => 'Required query params: s, n, w, e (bounding box in WGS84)']);
    }

    $limit   = min((int) ($_GET['limit'] ?? DEFAULT_LIMIT), MAX_LIMIT);
    $strict  = !empty($_GET['strict']) && $_GET['strict'] !== '0';
    $species = isset($_GET['species']) ? strtoupper(trim($_GET['species'])) : null;

    respond(200, query_bbox(
        $city,
        [['s' => $s, 'n' => $n, 'w' => $w, 'e' => $e]],
        $species, $strict, $limit
    ));
}

function handle_trees_post(): void
{
    $body = json_decode(file_get_contents('php://input'), true);

    $city = trim($body['city'] ?? '');
    if ($city === '') respond(400, ['error' => 'Request body must include "city"']);
    validate_city_data($city);

    if (!is_array($body) || !isset($body['bboxes']) || !is_array($body['bboxes']) || count($body['bboxes']) === 0) {
        respond(400, ['error' => 'Request body must include a non-empty "bboxes" array']);
    }

    foreach ($body['bboxes'] as $i => $bbox) {
        foreach (['s', 'n', 'w', 'e'] as $key) {
            if (!isset($bbox[$key]) || !is_numeric($bbox[$key])) {
                respond(400, ['error' => "bboxes[{$i}] missing or invalid field: {$key}"]);
            }
        }
    }

    $limit   = min((int) ($body['limit'] ?? DEFAULT_LIMIT), MAX_LIMIT);
    $strict  = !empty($body['strict']) && $body['strict'] !== false;
    $species = isset($body['species']) ? strtoupper(trim($body['species'])) : null;

    respond(200, query_bbox($city, $body['bboxes'], $species, $strict, $limit));
}

function query_bbox(string $city, array $bboxes, ?string $species, bool $strict, int $limit): array
{
    $conditions = [];

    foreach ($bboxes as $bbox) {
        // Embed validated floats directly — PDO binds floats as TEXT which breaks
        // SQLite's BETWEEN when the column stores REAL (TEXT > REAL in SQLite).
        $s = (float) $bbox['s']; $n = (float) $bbox['n'];
        $w = (float) $bbox['w']; $e = (float) $bbox['e'];
        $conditions[] = "(lat BETWEEN {$s} AND {$n} AND lon BETWEEN {$w} AND {$e})";
    }

    $sql    = 'SELECT * FROM trees WHERE (' . implode(' OR ', $conditions) . ')';
    $params = [];

    if ($species !== null && $species !== '') {
        $col              = $strict ? 'UPPER(species)' : 'UPPER(species_binomial)';
        $sql             .= " AND {$col} = :species";
        $params[':species'] = $species;
    }

    $sql .= ' LIMIT :limit';

    $stmt = db($city)->prepare($sql);
    if (isset($params[':species'])) $stmt->bindValue(':species', $params[':species']);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $seen = [];
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        if (!isset($seen[$row['id']])) {
            $seen[$row['id']] = true;
            $rows[]           = cast_row($row);
        }
    }
    return $rows;
}

function handle_species(): void
{
    $city = trim($_GET['city'] ?? '');
    if ($city === '') respond(400, ['error' => 'Required query param: city']);
    validate_city_data($city);

    $q      = trim($_GET['q'] ?? '');
    $strict = !empty($_GET['strict']) && $_GET['strict'] !== '0';

    if ($strict) {
        $select = 'SELECT species, species_binomial, MIN(name_vernacular) AS name_vernacular,
                          COUNT(*) AS count
                   FROM trees WHERE species IS NOT NULL';
        $group  = 'GROUP BY species ORDER BY COUNT(*) DESC';
        $col    = 'species';
    } else {
        $select = 'SELECT species_binomial AS species, species_binomial,
                          MIN(name_vernacular) AS name_vernacular, COUNT(*) AS count
                   FROM trees WHERE species_binomial IS NOT NULL';
        $group  = 'GROUP BY species_binomial ORDER BY COUNT(*) DESC';
        $col    = 'species_binomial';
    }

    if ($q === '') {
        $stmt = db($city)->query("{$select} {$group}");
    } else {
        $pattern = '%' . strtoupper($q) . '%';
        $stmt    = db($city)->prepare(
            "{$select} AND ({$col} LIKE :q OR name_vernacular LIKE :q2) {$group}"
        );
        $stmt->execute([':q' => $pattern, ':q2' => $pattern]);
    }

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['count'] = (int) $row['count'];
        $rows[] = $row;
    }
    respond(200, $rows);
}

function handle_health(): void
{
    $result = [];
    foreach (load_cities() as $city) {
        $path = __DIR__ . '/data/' . $city['id'] . '.db';
        if (!file_exists($path)) {
            $result[$city['id']] = ['status' => 'missing'];
            continue;
        }
        try {
            $row = db($city['id'])->query('SELECT COUNT(*) AS total FROM trees')->fetch();
            $result[$city['id']] = ['status' => 'ok', 'trees' => (int) $row['total']];
        } catch (Throwable $e) {
            $result[$city['id']] = ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    $check = function(string $file, string $table) {
        $path = __DIR__ . '/data/' . $file;
        if (!file_exists($path)) return ['status' => 'missing'];
        try {
            $pdo = new PDO('sqlite:' . $path);
            $row = $pdo->query("SELECT COUNT(*) AS total FROM {$table}")->fetch(PDO::FETCH_ASSOC);
            return ['status' => 'ok', 'entries' => (int) $row['total']];
        } catch (Throwable $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    };

    respond(200, [
        'cities'         => $result,
        'vernacular_nl'  => $check('vernacular-nl.db',   'vernacular_nl'),
        'vernacular_base'=> $check('vernacular-base.db', 'vernacular_base'),
    ]);
}

function handle_vernacular_names(): void
{
    $overrides = vernacular_overrides();
    $base      = vernacular_base();

    // Merge: start from base, overlay nl overrides, return all known species
    $all = [];
    foreach (array_keys($base + $overrides) as $key) {
        $entry = [];
        if (isset($base[$key])) {
            if ($base[$key]['nl']) $entry['nl'] = $base[$key]['nl'];
            if ($base[$key]['en']) $entry['en'] = $base[$key]['en'];
            if ($base[$key]['de']) $entry['de'] = $base[$key]['de'];
            if ($base[$key]['fr']) $entry['fr'] = $base[$key]['fr'];
        }
        if (isset($overrides[$key])) {
            $entry['nl'] = $overrides[$key]['name_vernacular'];  // override wins
        }
        if (!empty($entry)) $all[$key] = $entry;
    }

    respond(200, $all);
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

function cast_row(array $row): array
{
    $row['lat']            = (float) $row['lat'];
    $row['lon']            = (float) $row['lon'];
    $row['trunk_diameter'] = $row['trunk_diameter'] !== null ? (float) $row['trunk_diameter'] : null;
    $row['crown_spread']   = $row['crown_spread']   !== null ? (float) $row['crown_spread']   : null;
    return $row;
}

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
