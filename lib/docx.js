'use strict';
const HL_FILL = { yellow: 'FAE79C', green: 'D2EBC2', blue: 'C4DEF8', pink: 'F6D0DA', purple: 'E2D4F3' };
const xe = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wRun(text, o = {}) {
  const pr = [
    `<w:rFonts w:ascii="${o.font || 'Georgia'}" w:hAnsi="${o.font || 'Georgia'}" w:cs="${o.font || 'Georgia'}"/>`,
    o.b ? '<w:b/>' : '',
    o.i ? '<w:i/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    `<w:sz w:val="${o.sz || 22}"/><w:szCs w:val="${o.sz || 22}"/>`,
    o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '',
  ].join('');
  return `<w:r><w:rPr>${pr}</w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}

function wPara(runs, o = {}) {
  const pr = [
    o.keepNext ? '<w:keepNext/>' : '',
    o.border ? '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="B8892B"/></w:pBdr>' : '',
    `<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 80 : o.after}"/>`,
    o.indent ? `<w:ind w:left="${o.indent}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${pr}</w:pPr>${runs.join('')}</w:p>`;
}

