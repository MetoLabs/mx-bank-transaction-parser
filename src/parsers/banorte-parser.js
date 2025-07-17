import Papa from 'papaparse';
import { Transaction } from '../models/transaction.js';

export class BanorteParser {
    /**
     * Parses the entire Banorte pipe-delimited file content into an array of Transactions.
     *
     * @param {string} fileContent - The full text content of the Banorte file.
     * @returns {Transaction[]} Array of parsed Transaction objects.
     */
    parse(fileContent) {
        const { data } = Papa.parse(fileContent, {
            delimiter: '|',
            header: true,
            skipEmptyLines: true,
            transformHeader: header => header.trim(),
            transform: value => value.trim(),
        });

        return data
            .map(record => this.parseRecord(record))
            .filter(Boolean);
    }

    /**
     * Parses a single Banorte transaction record object into a Transaction instance.
     *
     * @param {Object} record - Parsed CSV record object with keys from header.
     * @param {string} record.Cuenta - Account number.
     * @param {string} record['Fecha De Operación'] - Transaction date (DD/MM/YYYY).
     * @param {string} record.Referencia - Reference code.
     * @param {string} record.Descripción - Description of transaction.
     * @param {string} record.Depósitos - Deposits amount (currency formatted).
     * @param {string} record.Retiros - Withdrawals amount (currency formatted).
     * @param {string} record.Saldo - Balance after transaction (currency formatted).
     * @returns {Transaction|null} Transaction instance or null if required fields missing.
     */
    parseRecord(record) {
        const {
            Cuenta: account,
            'Fecha De Operación': dateStr,
            Referencia: reference,
            Descripción: description,
            Depósitos: depositsStr,
            Retiros: withdrawalsStr,
            Saldo: balanceStr,
        } = record;

        if (!account || !dateStr) return null;

        const date = this._formatDate(dateStr);
        const deposits = this._parseMoney(depositsStr);
        const withdrawals = this._parseMoney(withdrawalsStr);
        const balance = this._parseMoney(balanceStr);
        const amount = deposits !== 0 ? deposits : -withdrawals;

        return new Transaction({
            date,
            type: deposits !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference,
            account,
            description,
            bank: 'Banorte',
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses a currency string (e.g. "$13,295.61") into a float number.
     *
     * @param {string} str - Currency formatted string.
     * @returns {number} Parsed numeric value or 0 if invalid.
     */
    _parseMoney(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/[$,]/g, '')) || 0;
    }

    /**
     * Converts a date string from DD/MM/YYYY format to ISO YYYY-MM-DD.
     *
     * @param {string} input - Date string in DD/MM/YYYY format.
     * @returns {string} Reformatted date string in YYYY-MM-DD format.
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}
