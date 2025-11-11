import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class AfirmeParser {
    /**
     * Parses Afirme CSV content with English headers
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const records = csv.parse(fileContent, {
                delimiter: ',',
                columns: (headers) => {
                    return headers.map(header => this._mapHeaderToEnglish(header));
                },
                skip_empty_lines: true,
                trim: true,
                cast: (value, context) => {
                    if (context.column === 'debit' || context.column === 'credit' || context.column === 'balance') {
                        return this._parseNumber(value);
                    }
                    return value;
                }
            });

            return records
                .map(record => this.parseRow(record))
                .filter(Boolean);
        } catch (error) {
            console.error('Error parsing Afirme file:', error);
            return [];
        }
    }

    /**
     * Maps Spanish headers to English
     *
     * @param {string} spanishHeader
     * @returns {string}
     */
    _mapHeaderToEnglish(spanishHeader) {
        const headerMap = {
            'Concepto': 'description',
            'Fecha (DD/MM/AA)': 'date',
            'Referencia': 'reference',
            'Cargo': 'debit',
            'Abono': 'credit',
            'Saldo': 'balance',
            'Cuenta': 'account',
            'Código': 'code',
            'No. Secuencia': 'sequence'
        };

        return headerMap[spanishHeader] || spanishHeader;
    }

    /**
     * Parses a single transaction record with English headers
     *
     * @param {Object} record
     * @returns {Transaction|null}
     */
    parseRow(record) {
        if (!record.date || !record.description) {
            return null;
        }

        const date = this._formatDate(record.date);
        const debit = record.debit || 0;
        const credit = record.credit || 0;
        const balance = record.balance || 0;
        const amount = credit !== 0 ? credit : -debit;

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: record.reference || '',
            accountNumber: record.account || '',
            description: record.description.trim(),
            bank: {
                id: '062',
                code: '40062',
                name: 'AFIRME',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses number with commas as thousands separator
     *
     * @param {string} str
     * @returns {number}
     */
    _parseNumber(str) {
        if (!str || str.trim() === '') return 0;
        const cleanStr = str.replace(/,/g, '').trim();
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts DD/MM/YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const [day, month, year] = input.split('/');
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}