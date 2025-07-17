import { Transaction } from '../models/transaction.js';

export class BbvaParser {
    /**
     * Parses the full BBVA TXT content.
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => this._looksLikeTransaction(line));

        return lines
            .map(line => this.parseLine(line))
            .filter(Boolean);
    }

    /**
     * Parses a single transaction line.
     *
     * @param {string} line
     * @returns {Transaction|null}
     */
    parseLine(line) {
        const regex = /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s+([\d,]+\.\d{2})$/;
        const match = line.match(regex);

        if (!match) return null;

        const [, dateStr, description, debitStr, creditStr, balanceStr] = match;

        const date = this._formatDate(dateStr);
        const debit = this._parseNumber(debitStr);
        const credit = this._parseNumber(creditStr);
        const balance = this._parseNumber(balanceStr);
        const amount = credit !== 0 ? credit : -debit;

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: '',
            account: '',
            description: description.trim(),
            bank: 'BBVA',
            raw: line,
        });
    }

    /**
     * Filters out headers and irrelevant lines.
     *
     * @param {string} line
     * @returns {boolean}
     */
    _looksLikeTransaction(line) {
        return /^\d{2}-\d{2}-\d{4}/.test(line);
    }

    /**
     * Parses number with commas as thousands separator.
     *
     * @param {string} str
     * @returns {number}
     */
    _parseNumber(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/,/g, ''));
    }

    /**
     * Converts DD-MM-YYYY to YYYY-MM-DD.
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const [day, month, year] = input.split('-');
        return `${year}-${month}-${day}`;
    }
}
