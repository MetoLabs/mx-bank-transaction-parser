import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class BbvaParser {
    /**
     * Parses BBVA TXT content with English headers
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const records = csv.parse(fileContent, {
                delimiter: '\t',
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
            console.error('Error parsing BBVA file:', error);
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
            'Día': 'date',
            'Concepto / Referencia': 'description',
            'Concepto': 'description',
            'cargo': 'debit',
            'Abono': 'credit',
            'Saldo': 'balance'
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
            reference: this._extractReference(record.description),
            accountNumber: '',
            description: record.description.trim(),
            bank: {
                id: '012',
                code: '40012',
                name: 'BBVA MEXICO',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Extrae referencia del concepto
     *
     * @param {string} description
     * @returns {string}
     */
    _extractReference(description) {
        const referenceMatch = description.match(/\/(\d{10,})/);
        return referenceMatch ? referenceMatch[1] : '';
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
     * Converts DD-MM-YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const [day, month, year] = input.split('-');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}