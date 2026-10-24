// Data access layer. Uses Node's built-in SQLite (reads from disk, low memory) and falls back
// to sql.js (WASM, loads the file into memory) if the runtime lacks node:sqlite.
// Kept free of Electron imports so it can be tested with plain Node.
'use strict';
const fs = require('fs');

class TskDb {
  static async open(dbPath) {
    const self = new TskDb();
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      self.native = db;
      self.engine = 'node:sqlite';
    } catch {
      const initSqlJs = require('sql.js');
      const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
      const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
      self.db = new SQL.Database(fs.readFileSync(dbPath));
      self.engine = 'sql.js';
    }
    self._loadIndex();
    return self;
  }

  _all(sql, params = []) {
    if (this.native) return this.native.prepare(sql).all(...params).map((r) => ({ ...r }));
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out = [];
      while (stmt.step()) out.push(stmt.getAsObject());
      return out;
    } finally {
      stmt.free();
    }
  }

  _loadIndex() {
    this.books = this._all('SELECT id, name, abbr, testament, chapters FROM books ORDER BY id');
    this.bookById = new Map(this.books.map((b) => [b.id, b]));
    // Compact verse location index: id -> [book, ch, vs]
    const rows = this._all('SELECT id, book, ch, vs FROM verses ORDER BY id');
    this.loc = new Array(rows.length + 1);
    this.firstId = new Map(); // "book:ch" -> first verse id
    this.verseCount = new Map(); // "book:ch" -> count
    for (const r of rows) {
      this.loc[r.id] = [r.book, r.ch, r.vs];
      const key = `${r.book}:${r.ch}`;
      if (!this.firstId.has(key)) this.firstId.set(key, r.id);
      this.verseCount.set(key, (this.verseCount.get(key) || 0) + 1);
    }
    try {
      this.enhanced = !!this._all("SELECT sqlite_compileoption_used('ENABLE_FTS3_PARENTHESIS') AS p")[0].p;
    } catch {
      this.enhanced = false;
    }
    this.meta = Object.fromEntries(this._all('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
    // Verse ids that have at least one TSK group
    this.hasRefs = new Set(this._all('SELECT DISTINCT verse_id AS v FROM xgroups').map((r) => r.v));
  }

  col() {
    return 'kjv'; // v3 is KJV-only
  }

  label(startId, endId = startId) {
    const [b1, c1, v1] = this.loc[startId];
    const [b2, c2, v2] = this.loc[endId];
    const ab = this.bookById.get(b1).abbr;
    if (startId === endId) return `${ab} ${c1}:${v1}`;
    if (b1 !== b2) return `${ab} ${c1}:${v1} – ${this.bookById.get(b2).abbr} ${c2}:${v2}`;
    if (c1 !== c2) return `${ab} ${c1}:${v1}–${c2}:${v2}`;
    return `${ab} ${c1}:${v1}-${v2}`;
  }

  fullLabel(id) {
    const [b, c, v] = this.loc[id];
    return `${this.bookById.get(b).name} ${c}:${v}`;
  }

  locate(id) {
    const [book, ch, vs] = this.loc[id];
    return { id, book, ch, vs };
  }

  verseId(book, ch, vs) {
    const first = this.firstId.get(`${book}:${ch}`);
    if (!first) return null;
    const n = this.verseCount.get(`${book}:${ch}`);
    const v = Math.min(Math.max(1, vs || 1), n);
    // verses are stored contiguously in canonical order
    const id = first + v - 1;
    return this.loc[id] && this.loc[id][2] === v ? id : first;
  }

  chapter(book, ch, tr) {
    const c = this.col(tr);
    const b = this.bookById.get(book);
    if (!b) return null;
    ch = Math.min(Math.max(1, ch), b.chapters);
    const hasMarkup = this._hasTable('verse_markup');
    const verses = this._all(
      hasMarkup
        ? `SELECT v.id, v.vs, v.${c} AS text, m.para, m.ital, m.red FROM verses v LEFT JOIN verse_markup m ON m.verse_id = v.id
            WHERE v.book=? AND v.ch=? ORDER BY v.vs`
        : `SELECT id, vs, ${c} AS text FROM verses WHERE book=? AND ch=? ORDER BY vs`,
      [book, ch]
    ).map((v) => ({ ...v, hasRefs: this.hasRefs.has(v.id) }));
    return { book, ch, name: b.name, chapters: b.chapters, verses };
  }

  passage(startId, endId, tr) {
    const c = this.col(tr);
    const MAX = 60;
    const end = Math.min(endId, startId + MAX - 1);
    const verses = this._all(`SELECT id, vs, ch, ${c} AS text FROM verses WHERE id BETWEEN ? AND ? ORDER BY id`, [startId, end]);
    return { label: this.label(startId, endId), truncated: endId > end, verses, start: this.locate(startId) };
  }

  xrefs(verseId, tr) {
    const c = this.col(tr);
    const v = this._all(`SELECT id, book, ch, vs, ${c} AS text FROM verses WHERE id=?`, [verseId])[0];
    if (!v) return null;
    const groups = this._all(
      `SELECT g.id, g.sort, g.${c}_anchor AS anchor, t.start_id AS s, t.end_id AS e
         FROM xgroups g JOIN xtargets t ON t.group_id = g.id
        WHERE g.verse_id = ? ORDER BY g.sort, t.ord`,
      [verseId]
    );
    const out = [];
    let cur = null;
    for (const r of groups) {
      if (!cur || cur.id !== r.id) {
        cur = { id: r.id, sort: r.sort, anchor: r.anchor, refs: [] };
        out.push(cur);
      }
      cur.refs.push({ start: r.s, end: r.e, label: this.label(r.s, r.e) });
    }
    // Reverse lookup: other verses whose TSK entries point at this verse
    const back = this._all(
      `SELECT DISTINCT g.verse_id AS v FROM xtargets t JOIN xgroups g ON g.id = t.group_id
        WHERE t.start_id BETWEEN ? AND ? AND t.end_id >= ? ORDER BY g.verse_id`,
      [verseId - 400, verseId, verseId]
    ).map((r) => ({ start: r.v, end: r.v, label: this.label(r.v) }));
    return {
      verse: { ...v, label: this.fullLabel(verseId) },
      groups: out,
      total: out.reduce((n, g) => n + g.refs.length, 0),
      referencedBy: back.filter((r) => r.start !== verseId),
    };
  }

  // Turn a user's search text into a safe FTS4 MATCH expression.
  /**
   * Split a user's search into FTS terms to include and terms to exclude.
   * Supports: words (all required), "exact phrases", OR, -exclude, prefix*. "AND" is implied.
   */
  static queryParts(q) {
    const pos = [];
    const neg = [];
    const re = /(-?)"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(q))) {
      let term;
      let isNeg = false;
      if (m[2] !== undefined) {
        const words = m[2].replace(/[^A-Za-z0-9' ]+/g, ' ').trim().toLowerCase();
        if (!words) continue;
        term = `"${words}"`;
        isNeg = m[1] === '-';
      } else {
        let t = m[3];
        if (/^(or|\|)$/i.test(t)) {
          if (pos.length && pos[pos.length - 1] !== 'OR') pos.push('OR');
          continue;
        }
        if (/^(and|&|\+)$/i.test(t)) continue; // all words are required anyway
        isNeg = t.startsWith('-') && t.length > 1;
        const star = t.endsWith('*');
        t = t.replace(/[^A-Za-z0-9']+/g, '').toLowerCase(); // lowercase so NOT/NEAR aren't operators
        if (!t) continue;
        term = `${t}${star ? '*' : ''}`;
      }
      (isNeg ? neg : pos).push(term);
    }
    while (pos.length && pos[pos.length - 1] === 'OR') pos.pop();
    while (pos.length && pos[0] === 'OR') pos.shift();
    return { pos: pos.join(' '), neg };
  }

  static toMatch(q, enhanced = false) {
    const { pos, neg } = TskDb.queryParts(q);
    if (!pos) return '';
    // Enhanced FTS syntax (ENABLE_FTS3_PARENTHESIS) excludes with NOT; standard syntax uses '-'
    const base = enhanced && /\bOR\b/.test(pos) ? `(${pos})` : pos;
    return [base, ...neg.map((t) => (enhanced ? `NOT ${t}` : `-${t}`))].join(' ');
  }

  /**
   * Full-text search over the KJV. Strong's numbers (G25, H2617) in the query restrict results
   * to verses that use that Hebrew/Greek word, and can be mixed with ordinary words.
   */
  search(query, tr, scope, limit = 200, offset = 0) {
    const strongs = [];
    const rest = String(query || '').replace(/\b([HGhg])0*(\d{1,4})[a-zA-Z]?\b/g, (_m, l, n) => {
      strongs.push(`${l.toUpperCase()}${n}`);
      return ' ';
    });
    const match = TskDb.toMatch(rest, this.enhanced);
    const parts = TskDb.queryParts(rest);
    if (!match && !strongs.length) {
      const error = parts.neg.length ? 'Add at least one word or Strong\'s number to search for, then use -word to leave words out.' : undefined;
      return { query, total: 0, results: [], strongs, error };
    }
    // Strong's search with only exclusions, e.g. "G25 -world": FTS can't run a pure NOT, so exclude by id
    const excludeOnly = !match && parts.neg.length ? parts.neg.join(' OR ') : null;

    const conds = [];
    const params = [];
    let from = 'verses v';
    if (match) {
      from = 'fts_kjv f JOIN verses v ON v.id = f.docid';
      conds.push('fts_kjv MATCH ?');
      params.push(match);
    }
    for (const s of strongs) {
      conds.push('v.id IN (SELECT verse_id FROM words WHERE strongs = ?)');
      params.push(s);
    }
    if (excludeOnly) {
      conds.push('v.id NOT IN (SELECT docid FROM fts_kjv WHERE fts_kjv MATCH ?)');
      params.push(excludeOnly);
    }
    if (scope === 'OT') conds.push('v.book <= 39');
    else if (scope === 'NT') conds.push('v.book >= 40');
    else if (Number(scope) > 0) {
      conds.push('v.book = ?');
      params.push(Number(scope));
    }
    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
    try {
      const total = this._all(`SELECT COUNT(*) AS n FROM ${from}${where}`, params)[0].n;
      // Hits per book (first page only) for the search-results chart
      const byBook = offset === 0 ? this._all(`SELECT v.book AS book, COUNT(*) AS n FROM ${from}${where} GROUP BY v.book ORDER BY v.book`, params) : null;
      const results = this._all(`SELECT v.id, v.kjv AS text FROM ${from}${where} ORDER BY v.id LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset,
      ]).map((r) => ({ ...r, label: this.fullLabel(r.id) }));
      // For Strong's searches, report the English glosses so the UI can highlight them
      if (strongs.length && results.length) {
        const ids = results.map((r) => r.id);
        const ph = ids.map(() => '?').join(',');
        const sp = strongs.map(() => '?').join(',');
        const gl = this._all(
          `SELECT verse_id AS id, group_concat(gloss, ' · ') AS g FROM words
            WHERE verse_id IN (${ph}) AND strongs IN (${sp}) GROUP BY verse_id`,
          [...ids, ...strongs]
        );
        const m = new Map(gl.map((r) => [r.id, r.g]));
        results.forEach((r) => (r.glosses = m.get(r.id) || ''));
      }
      return { query, match, strongs, total, results, byBook };
    } catch (e) {
      return { query, match, strongs, total: 0, results: [], error: 'Could not understand that search. Try plain words, "a phrase", or a Strong\'s number like G25.' };
    }
  }

  versesByIds(ids, tr) {
    const c = this.col(tr);
    if (!ids.length) return [];
    const ph = ids.map(() => '?').join(',');
    const rows = this._all(`SELECT id, ${c} AS text FROM verses WHERE id IN (${ph})`, ids);
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.filter((id) => map.has(id)).map((id) => ({ ...map.get(id), label: this.fullLabel(id) }));
  }

  // ---------- v2: word study ----------
  words(verseId) {
    return this._all(
      `SELECT w.pos, w.word, w.translit, w.gloss, w.strongs, w.lang, w.morph, m.expansion AS grammar,
              COALESCE(NULLIF(w.lemma, ''), s.lemma) AS lemma, s.xlit, s.def, s.kjv_def, s.uses
         FROM words w LEFT JOIN strongs s ON s.id = w.strongs LEFT JOIN morph m ON m.code = w.main_morph
        WHERE w.verse_id = ? ORDER BY w.pos`,
      [verseId]
    );
  }

  strong(id) {
    const e = this._all('SELECT * FROM strongs WHERE id = ?', [id])[0];
    if (!e) return null;
    // How STEPBible glosses this word across the Bible (top renderings)
    const glosses = this._all(
      `SELECT lower(trim(gloss, ' ,.;:!?')) AS g, COUNT(*) AS n FROM words WHERE strongs = ?
        GROUP BY g ORDER BY n DESC LIMIT 12`,
      [id]
    );
    return { ...e, glosses };
  }

  concordance(id, tr, limit = 150, offset = 0) {
    const c = this.col(tr);
    const total = this._all('SELECT COUNT(DISTINCT verse_id) AS n FROM words WHERE strongs = ?', [id])[0].n;
    const rows = this._all(
      `SELECT v.id, v.${c} AS text, group_concat(w.gloss, ' · ') AS glosses
         FROM (SELECT DISTINCT verse_id FROM words WHERE strongs = ? ORDER BY verse_id LIMIT ? OFFSET ?) x
         JOIN verses v ON v.id = x.verse_id
         JOIN words w ON w.verse_id = v.id AND w.strongs = ?
        GROUP BY v.id ORDER BY v.id`,
      [id, limit, offset, id]
    ).map((r) => ({ ...r, label: this.fullLabel(r.id) }));
    return { id, total, results: rows };
  }

  // ---------- v2: Webster 1828 ----------
  static headwordCandidates(word) {
    const w = String(word || '').toLowerCase().replace(/[^a-z']/g, '').replace(/'s$/, '').replace(/'/g, '');
    if (!w) return [];
    const IRREG = {
      hath: 'have', hast: 'have', doth: 'do', dost: 'do', saith: 'say', sayest: 'say', spake: 'speak', art: 'be',
      wast: 'be', wert: 'be', shalt: 'shall', wilt: 'will', canst: 'can', couldest: 'could', didst: 'do',
      begat: 'beget', begotten: 'beget', gat: 'get', brake: 'break', bare: 'bear', sware: 'swear', slew: 'slay',
      slain: 'slay', smote: 'smite', smitten: 'smite', wrought: 'work', clave: 'cleave', drave: 'drive',
      gave: 'give', given: 'give', went: 'go', gone: 'go', came: 'come', made: 'make', said: 'say', took: 'take',
      taken: 'take', knew: 'know', known: 'know', thee: 'thou', thy: 'thou', thine: 'thou', ye: 'you', saw: 'see',
      seen: 'see', men: 'man', women: 'woman', children: 'child', brethren: 'brother', feet: 'foot', oxen: 'ox',
    };
    const out = [w];
    if (IRREG[w]) out.push(IRREG[w]);
    const rules = [
      [/ieth$/, 'y'], [/ied$/, 'y'], [/ies$/, 'y'], [/iest$/, 'y'],
      [/eth$/, 'e'], [/eth$/, ''], [/est$/, 'e'], [/est$/, ''], [/edst$/, 'e'], [/edst$/, ''],
      [/ed$/, 'e'], [/ed$/, ''], [/ing$/, 'e'], [/ing$/, ''], [/es$/, ''], [/s$/, ''],
      [/ly$/, ''], [/ness$/, ''], [/(.)\1(ed|ing|eth|est)$/, '$1'],
    ];
    for (const [re, rep] of rules) if (re.test(w)) out.push(w.replace(re, rep));
    return [...new Set(out)].filter((x) => x.length > 1 || x === 'a');
  }

  dict(word) {
    for (const cand of TskDb.headwordCandidates(word)) {
      const r = this._all('SELECT word, html FROM dict1828 WHERE word = ?', [cand])[0];
      if (r) return { query: word, headword: r.word, html: r.html };
    }
    return { query: word, headword: null, html: null };
  }

  // ---------- v3: Matthew Henry's Concise Commentary ----------
  commentary(verseId) {
    // 3.17.1: Matthew Henry's commentary is no longer in the database; the Commentary tab links to Blue Letter Bible
    if (!this._all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commentary'").length) return null;
    const r = this._all('SELECT id, start_id, end_id, html FROM commentary WHERE start_id <= ? AND end_id >= ? LIMIT 1', [
      verseId,
      verseId,
    ])[0];
    if (!r) return null;
    const prev = this._all('SELECT start_id FROM commentary WHERE id = ?', [r.id - 1])[0];
    const next = this._all('SELECT start_id FROM commentary WHERE id = ?', [r.id + 1])[0];
    return {
      ...r,
      label: this.label(r.start_id, r.end_id),
      prev: prev ? prev.start_id : null,
      next: next ? next.start_id : null,
    };
  }

  /** Resolve an OSIS reference ("John.3.16", "Gen.1.1-Gen.1.3", "Ps.23") to verse ids. */
  osis(ref) {
    if (!this._osisBooks) {
      const names = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa ' +
        'Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph ' +
        'Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split(' ');
      this._osisBooks = new Map(names.map((n, i) => [n.toLowerCase(), i + 1]));
    }
    const one = (s, isEnd) => {
      const m = String(s || '').trim().match(/^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?/);
      if (!m) return null;
      const b = this._osisBooks.get(m[1].toLowerCase());
      if (!b) return null;
      const ch = Number(m[2]);
      if (m[3]) return this.verseId(b, ch, Number(m[3]));
      const first = this.verseId(b, ch, 1);
      return isEnd ? first + this.verseCount.get(`${b}:${ch}`) - 1 : first;
    };
    const [a, z] = String(ref).split(/\s+/)[0].split('-');
    const start = one(a, false);
    if (!start) return null;
    let end = z ? one(z.includes('.') ? z : a.replace(/\d+$/, z), true) : one(a, true);
    if (!end || end < start) end = start;
    return { start, end, label: this.label(start, end) };
  }

  // ---------- v3: Nave's Topical Bible ----------
  naveForVerse(verseId) {
    return this._all(
      `SELECT t.id, t.subject, t.refs FROM nave_index i JOIN nave_topics t ON t.id = i.topic_id
        WHERE i.verse_id = ? ORDER BY t.subject COLLATE NOCASE`,
      [verseId]
    );
  }

  naveSearch(q, limit = 60) {
    q = String(q || '').trim();
    if (!q) return [];
    return this._all(
      `SELECT id, subject, refs, CASE WHEN subject LIKE ? THEN 0 ELSE 1 END AS rank
         FROM nave_topics WHERE subject LIKE ? ORDER BY rank, subject COLLATE NOCASE LIMIT ?`,
      [`${q}%`, `%${q}%`, limit]
    );
  }

  naveTopic(id) {
    const t = this._all('SELECT id, subject, section, refs FROM nave_topics WHERE id = ?', [id])[0];
    if (!t) return null;
    const lines = this._all('SELECT depth, text, refs FROM nave_lines WHERE topic_id = ? ORDER BY ord', [id]).map((l) => ({
      depth: l.depth,
      text: l.text,
      refs: JSON.parse(l.refs).map(([s, e]) => ({ start: s, end: e, label: this.label(s, e) })),
    }));
    return { ...t, lines };
  }

  _hasTable(name) {
    if (!this._tables) this._tables = new Set(this._all("SELECT name FROM sqlite_master WHERE type IN ('table','view')").map((r) => r.name));
    return this._tables.has(name);
  }

  // ---------- v3.3: Hitchcock's Bible names ----------
  /** Meanings for any Bible names among the given words (keys ignore case and hyphens). */
  names(words) {
    if (!this._hasTable('names') || !words || !words.length) return [];
    const keys = [...new Set(words.map((w) => String(w).toLowerCase().replace(/[^a-z]/g, '')).filter((w) => w.length > 1))];
    if (!keys.length) return [];
    const ph = keys.map(() => '?').join(',');
    return this._all(`SELECT name AS key, display, meaning FROM names WHERE name IN (${ph})`, keys);
  }

  // ---------- v3.4: Bible places (maps) ----------
  /** Places mentioned in a chapter, each with the verse numbers that mention it. */
  placesForChapter(book, ch) {
    if (!this._hasTable('places')) return [];
    const rows = this._all(
      `SELECT p.id, p.name, p.lon, p.lat, p.type, p.kind, p.score, p.verses AS total, v.id AS vid, v.vs
         FROM verses v JOIN place_verses pv ON pv.verse_id = v.id JOIN places p ON p.id = pv.place_id
        WHERE v.book = ? AND v.ch = ? ORDER BY v.vs`,
      [book, ch]
    );
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.id)) by.set(r.id, { id: r.id, name: r.name, lon: r.lon, lat: r.lat, type: r.type, kind: r.kind, score: r.score, total: r.total, verseIds: [], vss: [] });
      const p = by.get(r.id);
      p.verseIds.push(r.vid);
      p.vss.push(r.vs);
    }
    return [...by.values()];
  }

  placeDetail(id, limit = 300) {
    if (!this._hasTable('places')) return null;
    const p = this._all('SELECT id, name, lon, lat, type, kind, score, verses AS total FROM places WHERE id = ?', [id])[0];
    if (!p) return null;
    const verses = this._all(
      `SELECT v.id, v.kjv AS text FROM place_verses pv JOIN verses v ON v.id = pv.verse_id WHERE pv.place_id = ? ORDER BY v.id LIMIT ?`,
      [id, limit]
    ).map((r) => ({ ...r, label: this.fullLabel(r.id) }));
    return { ...p, verses };
  }

  // ---------- v3.4: cross-reference map ----------
  /**
   * Graph around a verse: ring 1 = its TSK references (grouped by key word), ring 2 = verses that
   * several ring-1 verses point to (where the references converge).
   */
  xrefGraph(verseId, maxRing1 = 36, maxRing2 = 24) {
    const groups = this._all(
      `SELECT g.sort, g.kjv_anchor AS anchor, t.start_id AS s, t.end_id AS e
         FROM xgroups g JOIN xtargets t ON t.group_id = g.id WHERE g.verse_id = ? ORDER BY g.sort, t.ord`,
      [verseId]
    );
    const ring1 = [];
    const seen = new Set([verseId]);
    for (const r of groups) {
      if (seen.has(r.s) || ring1.length >= maxRing1) continue;
      seen.add(r.s);
      ring1.push({ id: r.s, end: r.e, group: r.sort, anchor: r.anchor, label: this.label(r.s, r.e) });
    }
    const conv = new Map(); // verse -> set of ring-1 parents
    for (const n of ring1) {
      const targets = this._all(
        `SELECT DISTINCT t.start_id AS s FROM xgroups g JOIN xtargets t ON t.group_id = g.id WHERE g.verse_id = ?`,
        [n.id]
      );
      for (const t of targets) {
        if (seen.has(t.s)) continue;
        if (!conv.has(t.s)) conv.set(t.s, new Set());
        conv.get(t.s).add(n.id);
      }
    }
    const ring2 = [...conv.entries()]
      .filter(([, ps]) => ps.size >= 2)
      .sort((a, b) => b[1].size - a[1].size || a[0] - b[0])
      .slice(0, maxRing2)
      .map(([id, ps]) => ({ id, end: id, parents: [...ps], label: this.label(id) }));
    const keywords = [...new Map(groups.map((g) => [g.sort, g.anchor])).entries()].map(([sort, anchor]) => ({ sort, anchor }));
    return { center: { id: verseId, label: this.label(verseId) }, keywords, ring1, ring2, total: groups.length };
  }

  // ------------------------------------------------------------------ 3.7: devotional, parallels, people, timeline
  /** Spurgeon's Morning and Evening for a day ('MM-DD'). */
  devotional(day) {
    if (!this._hasTable('devotional')) return [];
    return this._all('SELECT period, ref, verse_id AS verseId, headline, body FROM devotional WHERE day = ? ORDER BY period DESC', [day]);
  }

  /** Parallel passages for a verse: Gospel parallels, Old Testament quotations, parallel accounts. */
  parallels(verseId) {
    if (!this._hasTable('par_groups')) return [];
    const groups = this._all(
      'SELECT DISTINCT g.gid, g.kind FROM par_verse pv JOIN par_groups g ON g.gid = pv.gid WHERE pv.verse_id = ? ORDER BY g.gid',
      [verseId]
    );
    return groups.map((g) => {
      const members = this._all('SELECT start_id AS s, end_id AS e, label, lang FROM par_members WHERE gid = ? ORDER BY rowid', [g.gid]);
      return {
        gid: g.gid,
        kind: g.kind,
        members: members.map((m) => ({
          ...m,
          self: m.s <= verseId && m.e >= verseId,
          text: this._all('SELECT kjv FROM verses WHERE id BETWEEN ? AND ? ORDER BY id', [m.s, m.e]).map((r) => r.kjv).join(' '),
        })),
      };
    });
  }

  /** Which verses in a chapter have parallels or quotations (for margin marks). */
  parallelsInChapter(book, ch) {
    if (!this._hasTable('par_groups')) return [];
    return this._all(
      `SELECT pv.verse_id AS id, GROUP_CONCAT(DISTINCT g.kind) AS kinds FROM par_verse pv JOIN par_groups g ON g.gid = pv.gid
         JOIN verses v ON v.id = pv.verse_id WHERE v.book = ? AND v.ch = ? GROUP BY pv.verse_id`,
      [book, ch]
    );
  }

  /** A passage that may span chapters: full text of each verse (for side-by-side parallels). */
  passageVerses(startId, endId, pad = 0) {
    const s = Math.max(1, startId - pad), e = endId + pad;
    return this._all('SELECT id, ch, vs, kjv AS text FROM verses WHERE id BETWEEN ? AND ? ORDER BY id', [s, e]).map((r) => ({
      ...r,
      inRange: r.id >= startId && r.id <= endId,
    }));
  }

  peopleInVerse(verseId) {
    if (!this._hasTable('people')) return [];
    return this._all(
      `SELECT p.pid, p.name, p.note, p.verses FROM person_verse pv JOIN people p ON p.pid = pv.pid WHERE pv.verse_id = ?
        ORDER BY p.verses DESC`,
      [verseId]
    );
  }

  /** A person with their immediate family (each link with the verse that states it). */
  person(pid) {
    const p = this._all('SELECT pid, name, sex, tribe, note, verses, first_verse AS firstVerse FROM people WHERE pid = ?', [pid])[0];
    if (!p) return null;
    // read each relationship from both sides: BibleData sometimes records a marriage or a birth only
    // from the other person's side ("Leah, wife of Jacob")
    const INV = { son: 'father', daughter: 'father', father: 'son', mother: 'son', husband: 'wife', wife: 'husband',
      concubine: 'concubinator', concubinator: 'concubine', brother: 'brother', sister: 'brother', 'half-brother': 'half-brother',
      'half-sister': 'half-brother', 'son (as was supposed)': 'father (as was supposed)', 'father (as was supposed)': 'son (as was supposed)' };
    const rel = this._all(
      `SELECT r.rel, r.p2 AS pid, r.category, r.verse_id AS verseId, q.name, q.note, q.sex, q.verses
         FROM relations r JOIN people q ON q.pid = r.p2 WHERE r.p1 = ?`,
      [pid]
    ).concat(this._all(
      `SELECT r.rel AS orel, r.p1 AS pid, r.category, r.verse_id AS verseId, q.name, q.note, q.sex, q.verses
         FROM relations r JOIN people q ON q.pid = r.p1 WHERE r.p2 = ?`,
      [pid]
    ).map((r) => ({ ...r, rel: INV[r.orel] || r.orel })));
    const pick = (types) => {
      const seen = new Map();
      for (const r of rel.filter((x) => types.includes(x.rel))) {
        const prev = seen.get(r.pid);
        if (!prev || (prev.category !== 'explicit' && r.category === 'explicit')) seen.set(r.pid, { ...r, ref: r.verseId ? this.label(r.verseId) : '' });
      }
      return [...seen.values()];
    };
    const parents = pick(['son', 'daughter', 'son (as was supposed)']).map((x) => ({ ...x, supposed: /supposed/.test(x.rel) }));
    const children = pick(['father', 'mother', 'father (as was supposed)']);
    // a concubine is named as such only where the text says so; an inferred one is shown as the other parent
    const spouses = pick(['husband', 'wife', 'concubine', 'concubinator']).map((x) =>
      /concubin/.test(x.rel) && x.category !== 'explicit' ? { ...x, coparent: true } : x);
    const siblings = pick(['brother', 'sister', 'half-brother', 'half-sister']);
    // the other parent of their children, where no marriage is recorded (e.g. Leah and Rachel for Jacob)
    const spouseIds = new Set(spouses.map((x) => x.pid));
    for (const c of children) {
      for (const op of this.person_parents(c.pid)) {
        if (op.pid === pid || spouseIds.has(op.pid)) continue;
        spouseIds.add(op.pid);
        spouses.push({ ...op, rel: 'co-parent', coparent: true, ref: op.verseId ? this.label(op.verseId) : '' });
      }
    }
    // siblings implied by a shared parent
    const known = new Set([pid, ...siblings.map((s) => s.pid)]);
    for (const par of parents) {
      for (const c of this._all(
        `SELECT r.p2 AS pid, q.name, q.note, q.sex, q.verses FROM relations r JOIN people q ON q.pid = r.p2
          WHERE r.p1 = ? AND r.rel IN ('father','mother')`,
        [par.pid]
      )) {
        if (!known.has(c.pid)) {
          known.add(c.pid);
          siblings.push({ ...c, rel: c.sex === 'female' ? 'sister' : 'brother', ref: '' });
        }
      }
    }
    const aka = this._hasTable('person_names')
      ? this._all('SELECT DISTINCT name FROM person_names WHERE pid = ? AND name <> ? ORDER BY name', [pid, p.name]).map((r) => r.name)
      : [];
    return { ...p, aka, firstRef: p.firstVerse ? this.label(p.firstVerse) : '', parents, children, spouses, siblings };
  }

  person_parents(pid) {
    return this._all(
      `SELECT q.pid, q.name, q.note, q.sex, q.verses, r.verse_id AS verseId FROM relations r JOIN people q ON q.pid = r.p2
        WHERE r.p1 = ? AND r.rel IN ('son','daughter')
       UNION SELECT q.pid, q.name, q.note, q.sex, q.verses, r.verse_id FROM relations r JOIN people q ON q.pid = r.p1
        WHERE r.p2 = ? AND r.rel IN ('father','mother')`,
      [pid, pid]
    );
  }

  /** The line of descent from a person back to an ancestor (default Adam), shortest path through parents. */
  personLine(pid, target = 'Adam_1') {
    const prev = new Map([[pid, null]]);
    let frontier = [pid];
    while (frontier.length && !prev.has(target)) {
      const next = [];
      for (const id of frontier) {
        for (const r of this._all(
          `SELECT p2 FROM relations WHERE p1 = ? AND rel IN ('son','daughter','son (as was supposed)') ORDER BY category = 'explicit' DESC`,
          [id]
        )) {
          if (!prev.has(r.p2)) {
            prev.set(r.p2, id);
            next.push(r.p2);
          }
        }
      }
      frontier = next;
    }
    if (!prev.has(target)) return [];
    const path = [];
    for (let id = target; id; id = prev.get(id)) path.push(id);
    return path.reverse().map((id) => this._all('SELECT pid, name, note FROM people WHERE pid = ?', [id])[0]);
  }

  personVerses(pid, limit = 400) {
    const ids = this._all('SELECT verse_id AS id FROM person_verse WHERE pid = ? ORDER BY verse_id LIMIT ?', [pid, limit]).map((r) => r.id);
    return ids.length ? this.versesByIds(ids) : [];
  }

  personSearch(q, limit = 40) {
    if (!this._hasTable('people')) return [];
    if (!this._hasTable('person_names')) {
      return this._all('SELECT pid, name, note, verses FROM people WHERE name LIKE ? ORDER BY name = ? DESC, verses DESC LIMIT ?', [`${q}%`, q, limit]);
    }
    // any name the Bible uses for the person: "Paul" finds Saul of Tarsus, "Peter" finds Simon
    return this._all(
      `SELECT p.pid, p.name, p.note, p.verses, MIN(n.name) AS alias, MAX(n.name = ? COLLATE NOCASE) AS exact
         FROM person_names n JOIN people p ON p.pid = n.pid WHERE n.name LIKE ? GROUP BY p.pid
        ORDER BY exact DESC, p.verses DESC LIMIT ?`,
      [q, `${q}%`, limit]
    ).map((r) => ({ ...r, name: r.alias && r.alias.toLowerCase() !== r.name.toLowerCase() && r.alias.toLowerCase().startsWith(q.toLowerCase()) ? `${r.alias} (${r.name})` : r.name }));
  }

  timeline() {
    if (!this._hasTable('events')) return [];
    return this._all('SELECT eid, title, year, date_label AS date, sort, first_verse AS verseId, label, nverses FROM events ORDER BY sort');
  }

  eventsForChapter(book, ch) {
    if (!this._hasTable('events')) return [];
    return this._all(
      `SELECT DISTINCT e.eid, e.title, e.year, e.date_label AS date, e.sort FROM event_verse ev JOIN events e ON e.eid = ev.eid
         JOIN verses v ON v.id = ev.verse_id WHERE v.book = ? AND v.ch = ? ORDER BY e.sort`,
      [book, ch]
    );
  }

  eventVerses(eid) {
    const ids = this._all('SELECT verse_id AS id FROM event_verse WHERE eid = ? ORDER BY verse_id', [eid]).map((r) => r.id);
    // collapse consecutive verses into passages
    const out = [];
    for (const id of ids) {
      const last = out[out.length - 1];
      if (last && id === last.e + 1) last.e = id;
      else out.push({ s: id, e: id });
    }
    return out.map((r) => ({ ...r, label: this.label(r.s, r.e) }));
  }
}

module.exports = { TskDb };
