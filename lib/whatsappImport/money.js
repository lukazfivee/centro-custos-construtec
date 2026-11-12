'use strict';

function parseBrl(text) {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+))\s*,\s*(\d{2})$/i);
  if (!match) return null;
  const cents = BigInt(match[1].replace(/\./g, '')) * 100n + BigInt(match[2]);
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

function findAmountsInText(text) {
  if (typeof text !== 'string') return [];
  const matches = text.match(/(?<![\d.\w-])(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)\s*,\s*\d{2}(?![\d\w])/gi) || [];
  return matches.map(parseBrl).filter((value) => value !== null);
}

module.exports = { parseBrl, findAmountsInText };
