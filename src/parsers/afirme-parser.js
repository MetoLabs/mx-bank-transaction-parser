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

        const extractedData = this._extractFromDescription(record.description);

        const reference = extractedData.reference || record.reference || '';

        const actualDescription = this._buildActualDescription(record.description, extractedData);

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: reference,
            accountNumber: record.account || '',
            description: actualDescription,
            beneficiary: extractedData.beneficiary || null,
            trackingKey: extractedData.trackingKey || null,
            hour: extractedData.hour || '',
            rfc: extractedData.rfc || '',
            concept: extractedData.concept || '',
            bank: {
                id: '062',
                code: '40062',
                name: 'AFIRME',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Extracts structured data from the description field
     *
     * @param {string} description
     * @returns {Object}
     */
    _extractFromDescription(description) {
        const result = {
            trackingKey: null,
            reference: null,
            hour: null,
            beneficiary: null,
            rfc: null,
            concept: null,
            rawDescription: description
        };

        try {
            const trackingMatch = description.match(/RASTREO\s+([A-Z0-9]+)/);
            if (trackingMatch) {
                result.trackingKey = trackingMatch[1];
            }

            const refMatch = description.match(/REFERENCIA:(\S+)/);
            if (refMatch) {
                result.reference = refMatch[1];
            }

            const hourMatch = description.match(/HORA:(\d{2}:\d{2}:\d{2})/);
            if (hourMatch) {
                result.hour = hourMatch[1];
            }

            const rfcMatch = description.match(/RFC\s+([A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A])/);
            if (rfcMatch) {
                result.rfc = rfcMatch[1];
            }

            const conceptMatch = description.match(/CONCEPTO\s+(\S+)/);
            if (conceptMatch) {
                result.concept = conceptMatch[1];
            }

            const beneficiaryMatch = description.match(/HORA:\d{2}:\d{2}:\d{2}\s+(.+?)(?:\s+RFC\s+[A-Z]|$)/);
            if (beneficiaryMatch) {
                result.beneficiary = beneficiaryMatch[1].trim();
            }

        } catch (error) {
            console.warn('Error extracting data from description:', error);
        }

        return result;
    }

    /**
     * Builds the actual description from extracted parts
     *
     * @param {string} originalDescription
     * @param {Object} extractedData
     * @returns {string}
     */
    _buildActualDescription(originalDescription, extractedData) {
        const descriptionMatch = originalDescription.match(/HORA:\d{2}:\d{2}:\d{2}\s+(.+?)(?:\s+RFC\s+[A-Z]|$)/);

        if (descriptionMatch) {
            return descriptionMatch[1].trim();
        }

        if (extractedData.beneficiary) {
            return extractedData.beneficiary;
        }

        return this._cleanDescription(originalDescription);
    }

    /**
     * Cleans the description by removing technical parts
     *
     * @param {string} description
     * @returns {string}
     */
    _cleanDescription(description) {
        let cleanDescription = description
            .replace(/RASTREO\s+[A-Z0-9]+\s+/, '')
            .replace(/REFERENCIA:\S+\s+/, '')
            .replace(/HORA:\d{2}:\d{2}:\d{2}\s+/, '')
            .replace(/DE\s+LA\s+CTA\s+CLABE\s+\d+/, '')
            .replace(/RFC\s+[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]/, '')
            .replace(/CONCEPTO\s+\S+/, '')
            .trim();

        return cleanDescription.replace(/\s+/g, ' ').trim();
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