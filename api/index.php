<?php
/**
 * Rotterdam trees API
 *
 * Endpoints:
 *   GET /api/trees?s=&n=&w=&e=            trees in bounding box (south/north/west/east)
 *   GET /api/trees?s=&n=&w=&e=&species=   filtered by species
 *   GET /api/trees?s=&n=&w=&e=&limit=     custom limit (max 2000, default 500)
 *   GET /api/species?q=                    species autocomplete
 *   GET /api/health                        row count + db status
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
// Strip any path prefix so the file works both at domain root and in a subfolder
$route = '/' . ltrim(substr($segment, strrpos($segment, '/api') + 4), '/');

match ($route) {
    '/trees'   => handle_trees(),
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

function handle_trees(): void
{
    $s = filter_input(INPUT_GET, 's', FILTER_VALIDATE_FLOAT);
    $n = filter_input(INPUT_GET, 'n', FILTER_VALIDATE_FLOAT);
    $w = filter_input(INPUT_GET, 'w', FILTER_VALIDATE_FLOAT);
    $e = filter_input(INPUT_GET, 'e', FILTER_VALIDATE_FLOAT);

    if ($s === false || $n === false || $w === false || $e === false
        || $s === null || $n === null || $w === null || $e === null) {
        respond(400, ['error' => 'Required query params: s, n, w, e (bounding box in WGS84)']);
    }

    $limit   = min((int) ($_GET['limit'] ?? DEFAULT_LIMIT), MAX_LIMIT);
    $species = isset($_GET['species']) ? strtoupper(trim($_GET['species'])) : null;

    $sql    = 'SELECT * FROM trees WHERE lat BETWEEN :s AND :n AND lon BETWEEN :w AND :e';
    $params = [':s' => $s, ':n' => $n, ':w' => $w, ':e' => $e];

    if ($species !== null && $species !== '') {
        $sql             .= ' AND species = :species';
        $params[':species'] = $species;
    }

    $sql .= ' LIMIT :limit';

    $stmt = db()->prepare($sql);
    foreach ($params as $key => $val) {
        $stmt->bindValue($key, $val);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $rows = array_map('cast_row', $stmt->fetchAll());
    respond(200, $rows);
}

function handle_species(): void
{
    $q = trim($_GET['q'] ?? '');

    if ($q === '') {
        $stmt = db()->query(
            'SELECT DISTINCT species, name_indigenous FROM trees ORDER BY species LIMIT 50'
        );
    } else {
        $pattern = '%' . strtoupper($q) . '%';
        $stmt    = db()->prepare(
            'SELECT DISTINCT species, name_indigenous FROM trees
             WHERE species LIKE :q OR name_indigenous LIKE :q2
             ORDER BY species LIMIT 50'
        );
        $stmt->execute([':q' => $pattern, ':q2' => '%' . $q . '%']);
    }

    respond(200, $stmt->fetchAll());
}

function handle_health(): void
{
    $row = db()->query('SELECT COUNT(*) AS total FROM trees')->fetch();
    respond(200, ['status' => 'ok', 'trees' => (int) $row['total']]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Cast numeric columns stored as TEXT back to their proper types. */
function cast_row(array $row): array
{
    $row['lat']          = (float) $row['lat'];
    $row['lon']          = (float) $row['lon'];
    $row['crown_spread'] = $row['crown_spread'] !== null ? (float) $row['crown_spread'] : null;
    $row['trunk_diameter'] = $row['trunk_diameter'] !== null ? (float) $row['trunk_diameter'] : null;
    return $row;
}

function respond(int $status, mixed $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
