import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class SantanderParser {
    /**
     * Parses Santander CSV content
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const lines = fileContent.split(/\r?\n/).map(line => line.trim());

            const accountInfo = this._extractAccountInfo(lines);
            const accountNumber = accountInfo.accountNumber || '';

            const records = [];
            let inDataSection = false;

            for (const line of lines) {
                if (line.startsWith('Fecha,Hora,Sucursal,Descripcion,Importe Cargo,Importe Abono,Saldo,Referencia,Concepto')) {
                    inDataSection = true;
                    continue;
                }

                if (inDataSection) {
                    if (line === '' || !this._isDataLine(line)) {
                        break;
                    }

                    const record = this._parseDataLine(line);
                    if (record) {
                        records.push(record);
                    }
                }
            }

            return records
                .map(record => this.parseRow(record, accountNumber))
                .filter(Boolean);

        } catch (error) {
            console.error('Error parsing Santander file:', error);
            return [];
        }
    }

    /**
     * Parses a single data line from Santander CSV
     *
     * @param {string} line
     * @returns {Object|null}
     */
    _parseDataLine(line) {
        try {
            const columns = [];
            let current = '';
            let inQuotes = false;
            let quoteChar = '';

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if ((char === "'" || char === '"') && !inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar && inQuotes) {
                    inQuotes = false;
                    quoteChar = '';
                } else if (char === ',' && !inQuotes) {
                    columns.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }

            if (current !== '') {
                columns.push(current.trim());
            }

            if (columns.length !== 9) {
                console.warn('Unexpected number of columns in Santander line:', columns.length, line);
                return null;
            }

            return {
                date: columns[0].replace(/'/g, ''),
                time: columns[1].replace(/'/g, ''),
                branch: columns[2].replace(/'/g, ''),
                description: columns[3].replace(/'/g, ''),
                debit: columns[4],
                credit: columns[5],
                balance: columns[6],
                reference: columns[7],
                concept: columns[8]
            };
        } catch (error) {
            console.error('Error parsing Santander data line:', error, line);
            return null;
        }
    }

    /**
     * Extracts account information from header lines
     *
     * @param {string[]} lines
     * @returns {Object}
     */
    _extractAccountInfo(lines) {
        const accountInfo = {
            accountNumber: '',
            accountName: '',
            period: '',
            userName: ''
        };

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const line = lines[i];

            if (line.includes('Cuenta:')) {
                accountInfo.accountNumber = line.split('Cuenta:')[1]?.split(',')[0]?.trim() || '';
            }
            if (line.includes('Contrato:')) {
                accountInfo.accountName = line.split('Contrato:')[1]?.trim() || '';
            }
            if (line.includes('Periodo de:')) {
                const periodMatch = line.match(/Periodo de:\s*(\d{2}\/\d{2}\/\d{4})\s*al\s*(\d{2}\/\d{2}\/\d{4})/);
                if (periodMatch) {
                    accountInfo.period = `${periodMatch[1]} - ${periodMatch[2]}`;
                }
            }
            if (line.includes('Usuario:')) {
                accountInfo.userName = line.split('Usuario:')[1]?.split(',')[0]?.trim() || '';
            }
        }

        return accountInfo;
    }

    /**
     * Checks if line contains transaction data
     *
     * @param {string} line
     * @returns {boolean}
     */
    _isDataLine(line) {
        return line.match(/^'\d{8}',/);
    }

    /**
     * Parses a single transaction record
     *
     * @param {Object} record
     * @param {string} accountNumber
     * @returns {Transaction|null}
     */
    parseRow(record, accountNumber) {
        if (!record.date || !record.description) {
            return null;
        }

        const date = this._formatDate(record.date);
        const debit = this._parseCurrency(record.debit);
        const credit = this._parseCurrency(record.credit);
        const balance = this._parseCurrency(record.balance);
        const amount = credit !== 0 ? credit : -debit;

        let description = record.description.trim();
        if (record.concept && record.concept.trim() !== '' &&
            !record.concept.includes('MEDICMAS REF 0000000') &&
            !record.concept.includes('REF 0000000')) {
            description = record.concept.trim();
        }

        return new Transaction({
            date,
            time: record.time || null,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: record.reference || '',
            accountNumber: accountNumber,
            description: description,
            bank: {
                id: '014',
                code: '40014',
                name: 'SANTANDER',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses currency format with commas and quotes
     *
     * @param {string} str
     * @returns {number}
     */
    _parseCurrency(str) {
        if (!str || str.trim() === '' || str === '0') return 0;
        const cleanStr = str.replace(/["',]/g, '').trim();
        return parseFloat(cleanStr) || 0;
    }

    /**
     * Converts DDMMYYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        if (!input || input.length !== 8) return input;
        const day = input.substring(0, 2);
        const month = input.substring(2, 4);
        const year = input.substring(4, 8);
        return `${year}-${month}-${day}`;
    }
}