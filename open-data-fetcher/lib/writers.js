import fs from 'fs/promises';
import initSqlJs from 'sql.js';

export const DB_COLS = [
    'city', 'lat', 'lon', 'id', 'year_planted', 'name_indigenous',
    'species', 'species_binomial', 'species_cultivar',
    'genus', 'neighbourhood', 'street',
    'trunk_diameter', 'crown_spread', 'last_updated', 'last_fetched',
];

export async function writeJSON(trees, file) {
    await fs.writeFile(file, JSON.stringify(trees, null, 2), 'utf8');
}

export async function writeSQLite(trees, file) {
    const SQL = await initSqlJs();
    const db  = new SQL.Database();

    db.run(`CREATE TABLE trees (${DB_COLS.join(', ')})`);
    db.run(`CREATE INDEX idx_lat_lon          ON trees (lat, lon)`);
    db.run(`CREATE INDEX idx_species          ON trees (species)`);
    db.run(`CREATE INDEX idx_species_binomial ON trees (species_binomial)`);
    db.run(`CREATE INDEX idx_species_cultivar ON trees (species_binomial, species_cultivar)`);

    const placeholders = DB_COLS.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO trees VALUES (${placeholders})`);
    for (const tree of trees) {
        stmt.run(DB_COLS.map(c => tree[c] ?? null));
    }
    stmt.free();

    await fs.writeFile(file, Buffer.from(db.export()));
    db.close();
}
