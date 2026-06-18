import fs from 'fs/promises';
import initSqlJs from 'sql.js';

export const DB_COLS = [
    'city', 'lat', 'lon', 'id', 'year_planted', 'name_vernacular',
    'species', 'species_binomial', 'species_cultivar',
    'neighbourhood', 'street',
    'trunk_diameter', 'crown_spread', 'last_fetched',
];

function createSchema(db) {
    db.run(`CREATE TABLE trees (${DB_COLS.join(', ')})`);
    db.run(`CREATE INDEX idx_lat_lon          ON trees (lat, lon)`);
    db.run(`CREATE INDEX idx_species          ON trees (species)`);
    db.run(`CREATE INDEX idx_species_binomial ON trees (species_binomial)`);
    db.run(`CREATE INDEX idx_species_cultivar ON trees (species_binomial, species_cultivar)`);
}

function insertTrees(db, trees) {
    const placeholders = DB_COLS.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO trees VALUES (${placeholders})`);
    for (const tree of trees) {
        stmt.run(DB_COLS.map(c => tree[c] ?? null));
    }
    stmt.free();
}

export async function writeJSON(trees, file) {
    await fs.writeFile(file, JSON.stringify(trees, null, 2), 'utf8');
}

export async function writeSQLite(trees, file) {
    const SQL = await initSqlJs();
    const db  = new SQL.Database();
    createSchema(db);
    insertTrees(db, trees);
    await fs.writeFile(file, Buffer.from(db.export()));
    db.close();
}

export async function loadSQLiteCount(file) {
    try {
        const buf = await fs.readFile(file);
        const SQL = await initSqlJs();
        const db  = new SQL.Database(buf);
        const res = db.exec('SELECT COUNT(*) FROM trees');
        db.close();
        return Number(res[0]?.values[0][0] ?? 0);
    } catch {
        return 0;
    }
}

export async function loadSQLiteMaxId(file) {
    try {
        const buf = await fs.readFile(file);
        const SQL = await initSqlJs();
        const db  = new SQL.Database(buf);
        const res = db.exec('SELECT MAX(CAST(id AS INTEGER)) FROM trees');
        db.close();
        const val = res[0]?.values[0][0];
        return val != null ? Number(val) : null;
    } catch {
        return null;
    }
}

export async function appendSQLite(trees, file) {
    if (trees.length === 0) return;
    const SQL = await initSqlJs();
    let db;
    try {
        const buf = await fs.readFile(file);
        db = new SQL.Database(buf);
    } catch {
        db = new SQL.Database();
        createSchema(db);
    }
    insertTrees(db, trees);
    await fs.writeFile(file, Buffer.from(db.export()));
    db.close();
}
