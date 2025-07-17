import { AfirmeParser } from './parsers/afirme-parser.js';
import { BanBajioParser } from './parsers/banbajio-parser.js';
import { BanorteParser } from './parsers/banorte-parser.js';
import { BbvaParser } from './parsers/bbva-parser.js';
import { ScotiabankParser } from './parsers/scotiabank-parser.js';

/**
 * Returns the appropriate parser instance for a given bank name.
 *
 * @param {string} bankName - Name of the bank (case-insensitive)
 * @returns {BaseParser} Instance of a parser for the specified bank
 * @throws {Error} If no parser is available for the given bank
 */
export function getParserForBank(bankName) {
    switch (bankName.toLowerCase()) {
        case 'afirme':
            return new AfirmeParser();
        case 'banbajio':
            return new BanBajioParser();
        case 'banorte':
            return new BanorteParser();
        case 'bbva':
            return new BbvaParser();
        case 'scotiabank':
            return new ScotiabankParser();
        default:
            throw new Error(`No parser available for bank: ${bankName}`);
    }
}