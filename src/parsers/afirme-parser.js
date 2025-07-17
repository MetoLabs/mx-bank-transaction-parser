import { Transaction } from '../models/transaction.js';

export class AfirmeParser {
    /**
     * Parses the entire CSV file content into an array of Transactions.
     *
     * @param {string} fileContent - The full CSV file content as a string.
     * @returns {Transaction[]} Array of parsed transactions.
     */
    parse(fileContent) {
        const lines = fileContent
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return lines
            .map(line => this.parseLine(line))
            .filter(Boolean);
    }

    /**
     * Parses a single CSV line into a Transaction instance.
     *
     * @param {string} line - A CSV line representing a transaction.
     * @returns {Transaction|null} Parsed Transaction or null if invalid.
     */
    parseLine(line) {
        const parts = this._splitCsvLine(line);
        if (parts.length < 7) return null;

        const description = parts[0];
        const date = this._formatDate(parts[1]);
        const reference = parts[2];
        const debit = parseFloat(parts[3]) || 0;
        const credit = parseFloat(parts[4]) || 0;
        const balance = parseFloat(parts[5]) || 0;
        const account = parts[6];
        const amount = credit !== 0 ? credit : -debit;

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference,
            account,
            description,
            bank: 'Afirme',
            raw: line,
        });
    }

    /**
     * Converts a date string in DD/MM/YY format to ISO YYYY-MM-DD format.
     *
     * @param {string} input - Date string in DD/MM/YY format.
     * @returns {string} Date string in YYYY-MM-DD format.
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        const fullYear = Number(year) > 70 ? `19${year}` : `20${year}`;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    /**
     * Splits a CSV line by commas into an array of fields.
     * Does not handle quoted commas.
     *
     * @param {string} line - A CSV line string.
     * @returns {string[]} Array of CSV fields.
     */
    _splitCsvLine(line) {
        return line.split(',');
    }
}
