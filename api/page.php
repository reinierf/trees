<?php
/**
 * Site pages: the app's index.html with per-page search and link-preview tags.
 *
 * app/public/.htaccess sends these requests here:
 *   /                        national overview: the default tags, plus a list of all places
 *   /<source-id>             a place: title, description, canonical, Dataset JSON-LD, a summary
 *   /<source-id>?boom=<id>   a shared tree: preview tags for that tree, not indexed
 *   /sitemap.xml             the overview and every place
 *
 * The built index.html (webroot/index.html, one level up) is the template: its tags are the
 * overview's defaults and its canonical link gives the site URL. Only tag values are replaced, so
 * index.html stays the single place for the defaults. The summary is put inside #root, where it
 * is read by crawlers and shows until the app mounts and replaces it.
 *
 * Any failure (template or databases missing) falls back to the plain template, never an error
 * page: the app itself must always load.
 */

define('TOP_SPECIES', 10);          // most common species listed on a place page
define('DESCRIPTION_SPECIES', 3);   // of which named in the meta description
// Case mapping without requiring mbstring (not on every host): ASCII plus these accented letters.
define('UPPER_ACCENTED', 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝ');
define('LOWER_ACCENTED', 'àáâãäåæçèéêëìíîïñòóôõöøùúûüý');

$template = @file_get_contents(__DIR__ . '/../index.html');
if ($template === false) {
    http_response_code(500);
    exit('index.html not found next to api/');
}

$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'], 2)), '/');   // '' or '/subfolder'
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
$page = trim(substr($path, strlen($base)), '/');

try {
    if ($page === 'sitemap.xml') {
        send_sitemap(site_url($template));
    } else {
        send_page($template, $page, $base);
    }
} catch (Throwable $e) {
    error_log('page.php: ' . $e->getMessage());
    send_html($template);
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function send_page(string $html, string $page, string $base): void
{
    $site = site_url($html);
    $sources = sources();

    if ($page === '') {
        send_html(overview($html, $site, $sources));
        return;
    }

    $source = $sources[strtolower($page)] ?? null;
    if (!$source) {
        // Unknown place: the app shows the national overview; tell crawlers there's nothing here.
        http_response_code(404);
        $html = set_meta($html, 'name', 'robots', 'noindex, follow');
        send_html(overview($html, $site, $sources));
        return;
    }
    if ($page !== $source['id']) {
        $query = $_SERVER['QUERY_STRING'] ?? '';
        header('Location: ' . $base . '/' . $source['id'] . ($query !== '' ? '?' . $query : ''), true, 301);
        return;
    }

    $html = place($html, $site, $source, $sources);
    $treeId = $_GET['boom'] ?? null;
    if (is_string($treeId) && $treeId !== '') $html = shared_tree($html, $site, $source, $treeId);
    send_html($html);
}

function overview(string $html, string $site, array $sources): string
{
    $total = array_sum(array_column($sources, 'tree_count'));
    $intro = 'Bomenatlas zet de bomen van Nederland op één kaart: de straat- en parkbomen uit de open data van '
        . 'tientallen gemeenten, aangevuld met de collecties van arboreta. In totaal ' . number_nl($total)
        . ' bomen uit ' . count($sources) . ' bronnen. Tik op een boom voor de soort, het plantjaar, de stamdiameter '
        . "en foto's van de soort.";

    $html = add_json_ld($html, [
        '@context'    => 'https://schema.org',
        '@type'       => 'WebSite',
        'name'        => 'Bomenatlas',
        'alternateName' => 'bomenatlas.nl',
        'url'         => $site,
        'inLanguage'  => 'nl',
        'description' => meta_value($html, 'name', 'description'),
    ]);
    return set_root($html,
        '<h1>Bomenatlas: de bomen van Nederland op de kaart</h1>'
        . '<p>' . h($intro) . '</p>'
        . '<h2>Plaatsen</h2>'
        . places_list($sources, null, true));
}

function place(string $html, string $site, array $source, array $sources): string
{
    $name    = $source['name'];
    $isCity  = $source['type'] === 'city';
    $url     = $site . $source['id'];
    $meta    = json_decode($source['meta_json'] ?? '', true) ?: [];
    $origin  = $meta['source'] ?? null;
    [$speciesCount, $top] = source_species((int) $source['idx']);

    $heading = $isCity ? "Bomen in {$name}" : "Bomen van {$name}";
    $title   = $isCity ? "Bomen in {$name} op de kaart" : "Bomen van {$name} op de kaart";
    $trees   = number_nl((int) $source['tree_count']) . ' bomen';
    $species = $speciesCount ? number_nl($speciesCount) . ' soorten' : null;
    // "200.242 bomen van 407 soorten in Rotterdam", "de 3.169 bomen (721 soorten) van Bomenmuseum Gimborn"
    $counted = $isCity
        ? $trees . ($species ? " van {$species}" : '') . " in {$name}"
        : "de {$trees}" . ($species ? " ({$species})" : '') . " van {$name}";

    $description = capitalize_first_letter($counted) . ' op de kaart.';
    $named = array_map(fn($s) => $s['name'], array_slice($top, 0, DESCRIPTION_SPECIES));
    if ($named) $description .= ' Meest voorkomend: ' . join_nl($named) . '.';
    if ($origin) $description .= " Bron: {$origin}.";

    $html = set_title($html, "{$title} | Bomenatlas");
    $html = set_meta($html, 'name', 'description', $description);
    $html = set_canonical($html, $url);
    $html = set_meta($html, 'property', 'og:title', $title);
    $html = set_meta($html, 'property', 'og:description', $description);
    $html = set_meta($html, 'property', 'og:url', $url);
    $html = set_meta($html, 'property', 'og:image:alt', "{$heading} op Bomenatlas");

    $dataset = [
        '@context'    => 'https://schema.org',
        '@type'       => 'Dataset',
        'name'        => $heading,
        'description' => $description . ' Per boom de soort en, waar bekend, het plantjaar, de straat en de stamdiameter.',
        'url'         => $url,
        'isAccessibleForFree' => true,
        'spatialCoverage' => [
            '@type' => 'Place',
            'name'  => $name,
            'geo'   => ['@type' => 'GeoShape', 'box' => "{$source['s']} {$source['w']} {$source['n']} {$source['e']}"],
        ],
        'includedInDataCatalog' => ['@type' => 'DataCatalog', 'name' => 'Bomenatlas', 'url' => $site],
    ];
    if ($origin) $dataset['creator'] = ['@type' => 'Organization', 'name' => $origin];
    if ($source['last_fetched']) $dataset['dateModified'] = $source['last_fetched'];
    $html = add_json_ld($html, $dataset);

    $body = '<h1>' . h($heading) . '</h1>'
        . '<p>' . h("Bomenatlas zet {$counted} op de kaart."
            . ' Tik op een boom voor de soort en, waar bekend, het plantjaar, de straat en de stamdiameter.'
            . ($origin ? " Bron: {$origin}" . ($source['last_fetched'] ? ', bijgewerkt op ' . date_nl($source['last_fetched']) : '') . '.' : ''))
        . '</p>';
    if ($top) {
        $body .= '<h2>Meest voorkomende soorten</h2><ol>';
        foreach ($top as $s) {
            $body .= '<li>' . h($s['name'])
                . ($s['binomial'] && $s['name'] !== $s['binomial'] ? ' <i>' . h($s['binomial']) . '</i>' : '')
                . ' — ' . number_nl($s['count']) . '</li>';
        }
        $body .= '</ol>';
    }
    $body .= '<h2>Andere plaatsen</h2>' . places_list($sources, $source['id'], false)
        . '<p><a href="./">Bomen van Nederland op de kaart</a></p>';
    return set_root($html, $body);
}

/** Link preview of a shared tree (/<source-id>?boom=<id>). Not indexed: the place page is. */
function shared_tree(string $html, string $site, array $source, string $treeId): string
{
    $stmt = trees_db()->prepare('SELECT species_id, species_cultivar, year_planted, street, trunk_diameter
                                 FROM trees WHERE source_idx = ? AND id = ?');
    $stmt->execute([(int) $source['idx'], $treeId]);
    $tree = $stmt->fetch();
    if (!$tree) return $html;

    $stmt = meta_db()->prepare('SELECT key, binomial, nl FROM species WHERE id = ?');
    $stmt->execute([(int) $tree['species_id']]);
    $species  = $stmt->fetch() ?: ['key' => '?', 'binomial' => null, 'nl' => null];
    $binomial = $species['binomial'] ? format_binomial($species['binomial']) : null;
    $cultivar = $tree['species_cultivar'] ? " '" . capitalize_first($tree['species_cultivar']) . "'" : '';
    $name     = ($species['nl'] ? format_vernacular($species['nl']) : ($binomial ?? capitalize_first($species['key']))) . $cultivar;

    $title = "{$name} in {$source['name']}";
    $facts = [];
    if ($binomial && $species['nl']) $facts[] = $binomial . $cultivar;
    if ($tree['street']) $facts[] = capitalize_words($tree['street']) . ', ' . $source['name'];
    if ($tree['year_planted']) $facts[] = 'geplant in ' . $tree['year_planted'];
    if ($tree['trunk_diameter'] !== null && is_numeric($tree['trunk_diameter'])) {
        $facts[] = 'stamdiameter ' . str_replace('.', ',', (string) (float) $tree['trunk_diameter']) . ' m';
    }
    $description = ($facts ? implode(' · ', $facts) . '. ' : '') . 'Bekijk deze boom op de kaart van Bomenatlas.';
    $url = $site . $source['id'] . '?' . http_build_query(['boom' => $treeId]);

    $html = set_title($html, "{$title} | Bomenatlas");
    $html = set_meta($html, 'name', 'description', $description);
    // Not indexed, and no canonical: noindex next to a canonical can carry over to the place page.
    $html = set_meta($html, 'name', 'robots', 'noindex, follow');
    $html = preg_replace('#\n\s*<link rel="canonical"[^>]*>#', '', $html, 1);
    $html = set_meta($html, 'property', 'og:title', $title);
    $html = set_meta($html, 'property', 'og:description', $description);
    $html = set_meta($html, 'property', 'og:url', $url);
    return set_meta($html, 'property', 'og:image:alt', "{$title} op Bomenatlas");
}

function send_sitemap(string $site): void
{
    $built = substr((string) meta_db()->query('SELECT built_at FROM build')->fetchColumn(), 0, 10);
    $urls = [$site];
    foreach (sources() as $s) $urls[] = $site . $s['id'];

    header('Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: no-cache');
    echo '<?xml version="1.0" encoding="UTF-8"?>', "\n",
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', "\n";
    foreach ($urls as $url) {
        echo '  <url><loc>', h($url), '</loc>', $built ? "<lastmod>{$built}</lastmod>" : '', "</url>\n";
    }
    echo "</urlset>\n";
}

/** Places as links, relative so they work from any page and in a subfolder. */
function places_list(array $sources, ?string $except, bool $withCounts): string
{
    $items = '';
    foreach ($sources as $s) {
        if ($s['id'] === $except) continue;
        $items .= '<li><a href="' . h($s['id']) . '">' . h($s['name']) . '</a>'
            . ($withCounts ? ' — ' . number_nl((int) $s['tree_count']) . ' bomen' : '') . '</li>';
    }
    return '<ul class="places">' . $items . '</ul>';
}

// ── Data ──────────────────────────────────────────────────────────────────────

function open_readonly(string $file): PDO
{
    $path = __DIR__ . '/data/' . $file;
    if (!file_exists($path)) throw new RuntimeException("{$file} not found");
    return new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::SQLITE_ATTR_OPEN_FLAGS  => PDO::SQLITE_OPEN_READONLY,
    ]);
}

function meta_db(): PDO
{
    static $db;
    return $db ??= open_readonly('meta.db');
}

function trees_db(): PDO
{
    static $db;
    return $db ??= open_readonly('trees.db');
}

/** Sources with trees, by id, in name order. */
function sources(): array
{
    static $sources;
    if ($sources !== null) return $sources;
    $sources = [];
    foreach (meta_db()->query('SELECT * FROM sources WHERE tree_count > 0 ORDER BY name') as $r) $sources[$r['id']] = $r;
    return $sources;
}

/**
 * [number of species, most common species] of a source. Species without a binomial are raw
 * dataset values ("Onbekend", "Overig"): counted, but not listed. Needs meta.db's source_species
 * table (build-db.js); an older meta.db gives no species.
 */
function source_species(int $idx): array
{
    try {
        $stmt = meta_db()->prepare('SELECT COUNT(*) FROM source_species WHERE source_idx = ?');
        $stmt->execute([$idx]);
        $count = (int) $stmt->fetchColumn();
        $stmt = meta_db()->prepare('SELECT s.binomial, s.nl, ss.count FROM source_species ss JOIN species s ON s.id = ss.species_id
                                    WHERE ss.source_idx = ? AND s.binomial IS NOT NULL ORDER BY ss.count DESC LIMIT ' . TOP_SPECIES);
        $stmt->execute([$idx]);
    } catch (PDOException) {
        return [0, []];
    }
    $top = [];
    foreach ($stmt as $r) {
        $binomial = format_binomial($r['binomial']);
        $top[] = ['name' => $r['nl'] ? format_vernacular($r['nl']) : $binomial, 'binomial' => $binomial, 'count' => (int) $r['count']];
    }
    return [$count, $top];
}

// ── Template ──────────────────────────────────────────────────────────────────

function site_url(string $html): string
{
    if (!preg_match('#<link rel="canonical" href="([^"]+)"#', $html, $m)) throw new RuntimeException('No canonical link in index.html');
    return rtrim(html_entity_decode($m[1]), '/') . '/';
}

function set_title(string $html, string $title): string
{
    return preg_replace_callback('#<title>.*?</title>#s', fn() => '<title>' . h($title) . '</title>', $html, 1);
}

/** Sets the content of <meta {attr}="{key}" content="...">, which must be in index.html. */
function set_meta(string $html, string $attr, string $key, string $value): string
{
    $pattern = '#(<meta ' . $attr . '="' . preg_quote($key, '#') . '" content=")[^"]*(")#';
    return preg_replace_callback($pattern, fn($m) => $m[1] . h($value) . $m[2], $html, 1);
}

function meta_value(string $html, string $attr, string $key): string
{
    $pattern = '#<meta ' . $attr . '="' . preg_quote($key, '#') . '" content="([^"]*)"#';
    return preg_match($pattern, $html, $m) ? html_entity_decode($m[1]) : '';
}

function set_canonical(string $html, string $url): string
{
    return preg_replace_callback('#(<link rel="canonical" href=")[^"]*(")#', fn($m) => $m[1] . h($url) . $m[2], $html, 1);
}

function add_json_ld(string $html, array $data): string
{
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
    return str_replace('</head>', "  <script type=\"application/ld+json\">{$json}</script>\n  </head>", $html);
}

/**
 * Static content inside #root, for crawlers that don't run JavaScript. Visually hidden (the
 * screen-reader-only pattern) so it doesn't flash before the app mounts and replaces it.
 */
function set_root(string $html, string $content): string
{
    $hidden = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;'
        . 'clip:rect(0,0,0,0);white-space:nowrap;border:0';
    return str_replace('<div id="root"></div>', '<div id="root"><main class="prerender" style="' . $hidden . '">' . $content . '</main></div>', $html);
}

function send_html(string $html): void
{
    if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) ob_start('ob_gzhandler');
    header('Content-Type: text/html; charset=utf-8');
    // index.html names the hashed assets of the current build: never serve a stale copy.
    header('Cache-Control: no-cache');
    echo $html;
}

// ── Formatting (Dutch) ────────────────────────────────────────────────────────

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function number_nl(int $n): string
{
    return number_format($n, 0, ',', '.');
}

function date_nl(string $ymd): string
{
    $months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    [$y, $m, $d] = array_map('intval', explode('-', $ymd) + [0, 1, 1]);
    return "{$d} " . $months[max(1, min(12, $m)) - 1] . " {$y}";
}

/** "a, b en c" */
function join_nl(array $items): string
{
    $last = array_pop($items);
    return $items ? implode(', ', $items) . ' en ' . $last : (string) $last;
}

function lower(string $s): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8')
        : strtr(strtolower($s), array_combine(mb_chars(UPPER_ACCENTED), mb_chars(LOWER_ACCENTED)));
}

function upper(string $s): string
{
    return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8')
        : strtr(strtoupper($s), array_combine(mb_chars(LOWER_ACCENTED), mb_chars(UPPER_ACCENTED)));
}

function mb_chars(string $s): array
{
    return preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
}

/** As capitalizeFirst in app/src/lib/utils.ts. */
function capitalize_first(string $s): string
{
    $s = trim($s);
    if ($s === '') return '';
    $first = mb_chars($s)[0];
    return upper($first) . lower(substr($s, strlen($first)));
}

/** Uppercases only the first letter: "de 3.169 bomen" → "De 3.169 bomen". */
function capitalize_first_letter(string $s): string
{
    $first = mb_chars($s)[0] ?? '';
    return upper($first) . substr($s, strlen($first));
}

/** As capitalize in app/src/lib/utils.ts: "KONINGIN EMMAPLEIN" → "Koningin Emmaplein". */
function capitalize_words(string $s): string
{
    return implode(' ', array_map('capitalize_first', preg_split('/\s+/u', trim($s), -1, PREG_SPLIT_NO_EMPTY)));
}

/** "TILIA × EUROPAEA" → "Tilia × europaea" (as the app shows binomials). */
function format_binomial(string $binomial): string
{
    return capitalize_first($binomial);
}

/** Same as formatVernacular in app/src/lib/species.ts: "ESDOORNBLADIGE PLATAAN" → "Esdoornbladige plataan". */
function format_vernacular(string $name): string
{
    return preg_replace_callback("/'([a-z])/", fn($m) => "'" . strtoupper($m[1]), capitalize_first($name));
}
