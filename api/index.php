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

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Router ────────────────────────────────────────────────────────────────────

try {
    $segment = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    $route   = '/' . ltrim(substr($segment, strrpos($segment, '/api') + 4), '/');
    $method  = $_SERVER['REQUEST_METHOD'];

    match ($route) {
        '/cities'          => handle_cities(),
        '/trees'           => $method === 'POST' ? handle_trees_post() : handle_trees_get(),
        '/species'         => handle_species(),
        '/health'          => handle_health(),
        '/flag'            => handle_flag(),
        '/issues'          => handle_issues_get(),
        '/issues/resolve'  => handle_issues_resolve(),
        default            => respond(404, ['error' => 'Unknown endpoint']),
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
    $cities = json_decode(file_get_contents($path), true);
    return $cities;
}

function validate_city(string $city): void
{
    $ids = array_column(load_cities(), 'id');
    if (!in_array($city, $ids, true)) {
        respond(400, ['error' => "Unknown city: \"{$city}\". Available: " . implode(', ', $ids)]);
    }
}

// ── Database ──────────────────────────────────────────────────────────────────

function db(string $city): PDO
{
    static $pool = [];
    if (isset($pool[$city])) return $pool[$city];
    $path = __DIR__ . '/' . $city . '.db';
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
 * Returns indigenous_names keyed by uppercase species_binomial.
 * Each value is ['name_indigenous' => ..., 'name_indigenous_alt' => ..., 'source' => ...].
 * Returns an empty array if indigenous-names-nl.db is not present.
 */
function indigenous_names(): array
{
    static $map;
    if ($map !== null) return $map;

    $path = __DIR__ . '/indigenous-names-nl.db';
    if (!file_exists($path)) { $map = []; return $map; }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $map = [];
    foreach ($pdo->query('SELECT species_binomial, name_indigenous, name_indigenous_alt, source FROM indigenous_names_nl') as $row) {
        $map[strtoupper($row['species_binomial'])] = [
            'name_indigenous'     => $row['name_indigenous'],
            'name_indigenous_alt' => $row['name_indigenous_alt'],
            'source'              => $row['source'],
        ];
    }
    return $map;
}

function enrich_name(array &$row): void
{
    $key = strtoupper($row['species_binomial'] ?? '');
    if ($key === '') return;
    $entry = indigenous_names()[$key] ?? null;
    if ($entry) $row['name_indigenous'] = $entry['name_indigenous'];
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
    validate_city($city);

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
    validate_city($city);

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
            enrich_name($row);
            $rows[]           = cast_row($row);
        }
    }
    return $rows;
}

function handle_species(): void
{
    $city = trim($_GET['city'] ?? '');
    if ($city === '') respond(400, ['error' => 'Required query param: city']);
    validate_city($city);

    $q      = trim($_GET['q'] ?? '');
    $strict = !empty($_GET['strict']) && $_GET['strict'] !== '0';

    if ($strict) {
        $select = 'SELECT species, species_binomial, MIN(name_indigenous) AS name_indigenous,
                          COUNT(*) AS count
                   FROM trees WHERE species IS NOT NULL';
        $group  = 'GROUP BY species ORDER BY COUNT(*) DESC';
        $col    = 'species';
    } else {
        $select = 'SELECT species_binomial AS species, species_binomial,
                          MIN(name_indigenous) AS name_indigenous, COUNT(*) AS count
                   FROM trees WHERE species_binomial IS NOT NULL';
        $group  = 'GROUP BY species_binomial ORDER BY COUNT(*) DESC';
        $col    = 'species_binomial';
    }

    if ($q === '') {
        $stmt = db($city)->query("{$select} {$group}");
    } else {
        $pattern = '%' . strtoupper($q) . '%';
        $stmt    = db($city)->prepare(
            "{$select} AND ({$col} LIKE :q OR name_indigenous LIKE :q2) {$group}"
        );
        $stmt->execute([':q' => $pattern, ':q2' => $pattern]);
    }

    $lookup = indigenous_names();
    $rows   = [];
    foreach ($stmt->fetchAll() as $row) {
        $key = strtoupper($row['species_binomial'] ?? '');
        if ($key !== '' && isset($lookup[$key])) {
            $row['name_indigenous'] = $lookup[$key]['name_indigenous'];
        }
        $row['count'] = (int) $row['count'];
        $rows[] = $row;
    }
    respond(200, $rows);
}

function handle_health(): void
{
    $result = [];
    foreach (load_cities() as $city) {
        $path = __DIR__ . '/' . $city['id'] . '.db';
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

    $snPath = __DIR__ . '/indigenous-names-nl.db';
    if (!file_exists($snPath)) {
        $snStatus = ['status' => 'missing'];
    } else {
        try {
            $pdo     = new PDO('sqlite:' . $snPath);
            $row     = $pdo->query('SELECT COUNT(*) AS total FROM indigenous_names_nl')->fetch(PDO::FETCH_ASSOC);
            $snStatus = ['status' => 'ok', 'entries' => (int) $row['total']];
        } catch (Throwable $e) {
            $snStatus = ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    respond(200, ['cities' => $result, 'indigenous_names_nl' => $snStatus]);
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
        $dutch   = trim((string) ($body['name_indigenous']  ?? '')) ?: null;
        $street  = trim((string) ($body['street']           ?? '')) ?: null;

        $existing = $db->prepare('SELECT created_at FROM tree_issues WHERE city=? AND tree_id=?');
        $existing->execute([$city, $tree_id]);
        $row = $existing->fetch();

        if ($row) {
            $db->prepare('UPDATE tree_issues SET lat=?,lon=?,species_binomial=?,name_indigenous=?,street=?,flags=?,note=?,updated_at=? WHERE city=? AND tree_id=?')
               ->execute([$lat,$lon,$bin,$dutch,$street,json_encode($flags),$note,$now,$city,$tree_id]);
        } else {
            $db->prepare('INSERT INTO tree_issues (city,tree_id,lat,lon,species_binomial,name_indigenous,street,flags,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([$city,$tree_id,$lat,$lon,$bin,$dutch,$street,json_encode($flags),$note,$now,$now]);
        }

    } elseif ($type === 'species') {
        $bin = trim((string) ($body['species_binomial'] ?? ''));
        if ($bin === '') respond(400, ['error' => 'species_binomial required']);

        $dutch = trim((string) ($body['name_indigenous'] ?? '')) ?: null;

        $existing = $db->prepare('SELECT created_at FROM species_issues WHERE species_binomial=?');
        $existing->execute([$bin]);
        $row = $existing->fetch();

        if ($row) {
            $db->prepare('UPDATE species_issues SET name_indigenous=?,flags=?,note=?,updated_at=? WHERE species_binomial=?')
               ->execute([$dutch,json_encode($flags),$note,$now,$bin]);
        } else {
            $db->prepare('INSERT INTO species_issues (species_binomial,name_indigenous,flags,note,created_at,updated_at) VALUES (?,?,?,?,?,?)')
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

    $path = __DIR__ . '/issues.db';
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
        name_indigenous  TEXT,
        street           TEXT,
        flags            TEXT NOT NULL DEFAULT \'[]\',
        note             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        PRIMARY KEY (city, tree_id)
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS species_issues (
        species_binomial TEXT NOT NULL PRIMARY KEY,
        name_indigenous  TEXT,
        flags            TEXT NOT NULL DEFAULT \'[]\',
        note             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
    )');
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

function respond(int $status, mixed $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
