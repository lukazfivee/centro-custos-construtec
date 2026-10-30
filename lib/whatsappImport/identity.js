'use strict';
const crypto = require('crypto');
function messageHash(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }
function lineClientId(hash, block, line) {
  const bytes = crypto.createHash('sha256').update(`${hash}|${block}|${line}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
module.exports = { messageHash, lineClientId };
