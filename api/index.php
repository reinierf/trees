<?php
/**
 * Rotterdam trees API
 *
 * Endpoints:
 *   GET  /api/trees?s=&n=&w=&e=[&species=][&strict=1][&limit=]
 *   POST /api/trees  body: {"bboxes":[{"s","n","w","e"},...],"limit"?,"species"?,"strict"?}
 *   GET  /api/species[?q=][&strict=1]
 *   GET  /api/health
 *
 * Deploy: upload index.php, .htaccess, and bomen-rotterdam.db to the same folder.
 */

define('DB_PATH',       __DIR__ . '/bomen-rotterdam.db');
define('DEFAULT_LIMIT', 500);
define('MAX_LIMIT',     2000);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// ── Router ────────────────────────────────────────────────────────────────────

$segment = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$route   = '/' . ltrim(substr($segment, strrpos($segment, '/api') + 4), '/');
$method  = $_SERVER['REQUEST_METHOD'];

match ($route) {
    '/trees'   => $method === 'POST' ? handle_trees_post() : handle_trees_get(),
    '/species' => handle_species(),
    '/health'  => handle_health(),
    default    => respond(404, ['error' => 'Unknown endpoint']),
};

// ── Database ──────────────────────────────────────────────────────────────────

function db(): PDO
{
    static $pdo;
    if ($pdo) return $pdo;

    if (!file_exists(DB_PATH)) {
        respond(503, ['error' => 'Database not found. Run the fetcher first.']);
    }

    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handle_trees_get(): void
{
    $s = filter_input(INPUT_GET, 's', FILTER_VALIDATE_FLOAT);
    $n = filter_input(INPUT_GET, 'n', FILTER_VALIDATE_FLOAT);
    $w = filter_input(INPUT_GET, 'w', FILTER_VALIDATE_FLOAT);
    $e = filter_input(INPUT_GET, 'e', FILTER_VALIDATE_FLOAT);

    if ($s === false || $n === false || $w === false || $e === false
        || $s === null || $n === null || $w === null || $e === null) {
        respond(400, ['error' => 'Required query params: s, n, w, e (bounding box in WGS84)']);
    }

    $limit  = min((int) ($_GET['limit'] ?? DEFAULT_LIMIT), MAX_LIMIT);
    $strict = !empty($_GET['strict']) && $_GET['strict'] !== '0';
    $species = isset($_GET['species']) ? strtoupper(trim($_GET['species'])) : null;

    respond(200, query_bbox(
        [['s' => $s, 'n' => $n, 'w' => $w, 'e' => $e]],
        $species, $strict, $limit
    ));
}

function handle_trees_post(): void
{
    $body = json_decode(file_get_contents('php://input'), true);

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

    respond(200, query_bbox($body['bboxes'], $species, $strict, $limit));
}

function query_bbox(array $bboxes, ?string $species, bool $strict, int $limit): array
{
    $conditions = [];
    $params     = [];

    foreach ($bboxes as $bbox) {
        // Embed validated floats directly — PDO binds floats as TEXT which breaks
        // SQLite's BETWEEN when the column stores REAL (TEXT > REAL in SQLite).
        $s = (float) $bbox['s']; $n = (float) $bbox['n'];
        $w = (float) $bbox['w']; $e = (float) $bbox['e'];
        $conditions[] = "(lat BETWEEN {$s} AND {$n} AND lon BETWEEN {$w} AND {$e})";
    }

    $sql = 'SELECT * FROM trees WHERE (' . implode(' OR ', $conditions) . ')';

    if ($species !== null && $species !== '') {
        $col              = $strict ? 'species' : 'species_binomial';
        $sql             .= " AND {$col} = :species";
        $params[':species'] = $species;
    }

    $sql .= ' LIMIT :limit';

    $stmt = db()->prepare($sql);
    if (isset($params[':species'])) {
        $stmt->bindValue(':species', $params[':species']);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    // Deduplicate by id in case bboxes overlap
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
    $q      = trim($_GET['q'] ?? '');
    $strict = !empty($_GET['strict']) && $_GET['strict'] !== '0';

    // Strict: one entry per full species string. Non-strict: one per binomial.
    if ($strict) {
        $select = 'SELECT species, species_binomial, MIN(name_indigenous) AS name_indigenous
                   FROM trees WHERE species IS NOT NULL';
        $group  = 'GROUP BY species ORDER BY species LIMIT 50';
        $col    = 'species';
    } else {
        $select = 'SELECT species_binomial AS species, species_binomial,
                          MIN(name_indigenous) AS name_indigenous
                   FROM trees WHERE species_binomial IS NOT NULL';
        $group  = 'GROUP BY species_binomial ORDER BY species_binomial LIMIT 50';
        $col    = 'species_binomial';
    }

    if ($q === '') {
        $stmt = db()->query("{$select} {$group}");
    } else {
        $pattern = '%' . strtoupper($q) . '%';
        $stmt    = db()->prepare(
            "{$select} AND ({$col} LIKE :q OR name_indigenous LIKE :q2) {$group}"
        );
        $stmt->execute([':q' => $pattern, ':q2' => $pattern]);
    }

    respond(200, $stmt->fetchAll());
}

function handle_health(): void
{
    $row = db()->query('SELECT COUNT(*) AS total FROM trees')->fetch();
    respond(200, ['status' => 'ok', 'trees' => (int) $row['total']]);
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
