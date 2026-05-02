import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface NoteRow {
  id: string;
  content: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

// ── Memory Layer ─────────────────────────────────────────────────────────────

export class Memory {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  /** Create the notes table if it doesn't exist. */
  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id         TEXT PRIMARY KEY,
        content    TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  /** Store a new note. Returns the created note. */
  addNote(content: string, tags: string[] = []): Note {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO notes (id, content, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, content, JSON.stringify(tags), now, now);

    return { id, content, tags, createdAt: now, updatedAt: now };
  }

  /** Simple keyword search across content and tags. */
  searchNotes(query: string): Note[] {
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM notes
         WHERE content LIKE ? OR tags LIKE ?
         ORDER BY created_at DESC`
      )
      .all(pattern, pattern) as NoteRow[];

    return rows.map(this.rowToNote);
  }

  /** Retrieve the N most recent notes. */
  getRecentNotes(n: number): Note[] {
    const rows = this.db
      .prepare(`SELECT * FROM notes ORDER BY created_at DESC LIMIT ?`)
      .all(n) as NoteRow[];

    return rows.map(this.rowToNote);
  }

  /** Delete a note by ID. Returns true if a row was deleted. */
  deleteNote(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /** Map a database row to a Note object. */
  private rowToNote(row: NoteRow): Note {
    return {
      id: row.id,
      content: row.content,
      tags: JSON.parse(row.tags) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
