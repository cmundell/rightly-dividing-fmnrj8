// Parses typed references like "John 3:16", "jn 3 16", "1 cor 13", "1co13:4-7", "Song 2", "Ps 23".
'use strict';
(function (global) {
  const EXTRA = {
    1: 'gn ge gen', 2: 'ex exo exod', 3: 'lv le lev', 4: 'nu nm num', 5: 'dt de deu deut', 6: 'jos josh', 7: 'jdg judg jg',
    8: 'ru rth', 9: '1sa 1sm 1sam 1samuel', 10: '2sa 2sm 2sam 2samuel', 11: '1ki 1kg 1kgs 1kings', 12: '2ki 2kg 2kgs 2kings',
    13: '1ch 1chr 1chron', 14: '2ch 2chr 2chron', 15: 'ezr', 16: 'ne neh', 17: 'es est esth', 18: 'jb', 19: 'ps psa psalm pss psm',
    20: 'pr pro prv prov', 21: 'ec ecc eccl eccles qoh', 22: 'so sos song songs sng canticles songofsongs', 23: 'is isa',
    24: 'je jer jr', 25: 'la lam', 26: 'eze ezk ezek', 27: 'da dn dan', 28: 'ho hos', 29: 'jl joe', 30: 'am amo',
    31: 'ob oba obad', 32: 'jon jnh', 33: 'mi mic', 34: 'na nah', 35: 'hab hb', 36: 'zep zeph zp', 37: 'hag hg',
    38: 'zec zech zc', 39: 'mal ml', 40: 'mt mat matt', 41: 'mk mr mar mrk', 42: 'lk lu luk', 43: 'jn jhn joh',
    44: 'ac act', 45: 'ro rom rm', 46: '1co 1cor', 47: '2co 2cor', 48: 'ga gal', 49: 'ep eph ephes', 50: 'php phil pp',
    51: 'col co', 52: '1th 1thes 1thess', 53: '2th 2thes 2thess', 54: '1ti 1tim', 55: '2ti 2tim', 56: 'ti tit',
    57: 'phm phlm philem', 58: 'he heb', 59: 'jas jm', 60: '1pe 1pet 1pt', 61: '2pe 2pet 2pt', 62: '1jn 1jo 1joh 1john',
    63: '2jn 2jo 2joh 2john', 64: '3jn 3jo 3joh 3john', 65: 'jud jd', 66: 're rev rv revelations apocalypse',
  };

  const norm = (s) =>
    s.toLowerCase()
      .replace(/^(first|i)\s+/, '1').replace(/^(second|ii)\s+/, '2').replace(/^(third|iii)\s+/, '3')
      .replace(/[^a-z0-9]/g, '');

  function makeParser(books) {
    const exact = new Map();
    for (const b of books) {
      exact.set(norm(b.name), b.id);
      exact.set(norm(b.abbr), b.id);
      for (const a of (EXTRA[b.id] || '').split(' ')) if (a) exact.set(a, b.id);
    }
    const names = books.map((b) => ({ id: b.id, key: norm(b.name) }));

    function findBook(raw) {
      const k = norm(raw);
      if (!k) return null;
      if (exact.has(k)) return exact.get(k);
      // unique prefix match against full names ("phili" -> Philippians is ambiguous with Philemon)
      const hits = names.filter((n) => n.key.startsWith(k));
      if (hits.length === 1) return hits[0].id;
      if (hits.length > 1 && k.length >= 3) return hits[0].id;
      return null;
    }

    return function parse(input) {
      const s = String(input || '').trim();
      if (!s) return null;
      // optional leading number, then letters (with spaces), then numbers
      const m = s.match(/^((?:[123]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(\d+)?(?:\s*[:.\s]\s*(\d+))?(?:\s*[-–]\s*(\d+))?\s*$/i);
      if (!m) return null;
      const book = findBook(m[1]);
      if (!book) return null;
      const meta = books.find((b) => b.id === book);
      let ch = m[2] ? parseInt(m[2], 10) : 1;
      let vs = m[3] ? parseInt(m[3], 10) : null;
      // single-chapter books: "Jude 3" means verse 3
      if (meta.chapters === 1 && m[2] && !m[3]) {
        vs = ch;
        ch = 1;
      }
      ch = Math.min(Math.max(1, ch), meta.chapters);
      const vsEnd = m[4] ? parseInt(m[4], 10) : null;
      return { book, ch, vs, vsEnd };
    };
  }

  global.makeRefParser = makeParser;
  if (typeof module !== 'undefined') module.exports = { makeRefParser: makeParser };
})(typeof window !== 'undefined' ? window : globalThis);
