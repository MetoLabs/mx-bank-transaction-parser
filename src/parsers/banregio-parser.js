import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class BanregioParser {
    /**
     * Parses Banregio CSV content with English headers
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const lines = fileContent.split(/\r?\n/).map(line => line.trim());

            let dataStartIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('Fecha,Descripción,Referencia,Cargo,Abonos,Saldo,Clasificación')) {
                    dataStartIndex = i + 1;
                    break;
                }
            }

            if (dataStartIndex === -1) {
                console.error('Could not find transaction data in Banregio file');
                return [];
            }

            const transactionLines = lines.slice(dataStartIndex).filter(line => {
                return line &&
                    !line.includes('Saldo Inicial') &&
                    !line.includes('Estado de Cuenta') &&
                    line.includes(',');
            });

            const transactionData = transactionLines.join('\n');

            const records = csv.parse(transactionData, {
                delimiter: ',',
                columns: ['date', 'description', 'reference', 'debit', 'credit', 'balance', 'classification'],
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                cast: (value, context) => {
                    if (context.column === 'debit' || context.column === 'credit' || context.column === 'balance') {
                        return this._parseCurrency(value);
                    }
                    return value;
                }
            });

            const accountInfo = this._extractAccountInfo(lines);
            const accountNumber = accountInfo.accountNumber || null;

            return records
                .map(record => this.parseRow(record, accountNumber))
                .filter(Boolean);
        } catch (error) {
            console.error('Error parsing Banregio file:', error);
            return [];
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
            clabe: '',
            accountName: '',
            rfc: '',
            address: '',
            period: ''
        };

        for (let i = 0; i < Math.min(lines.length, 15); i++) {
            const line = lines[i];

            if (line.includes('CUENTA:')) {
                accountInfo.accountNumber = line.split('CUENTA:')[1]?.split(',')[0]?.trim() || '';
            }
            if (line.includes('CLABE:')) {
                accountInfo.clabe = line.split('CLABE:')[1]?.split(',')[0]?.trim() || '';
            }
            if (line.includes('RFC:')) {
                accountInfo.rfc = line.split('RFC:')[1]?.split(',')[0]?.trim() || '';
            }
            if (line.includes('Fecha inicio:') && line.includes('Fecha fin:')) {
                const periodMatch = line.match(/Fecha inicio:\s*(\d{2}\/\d{2}\/\d{4}).*Fecha fin:\s*(\d{2}\/\d{2}\/\d{4})/);
                if (periodMatch) {
                    accountInfo.period = `${periodMatch[1]} - ${periodMatch[2]}`;
                }
            }

            if (i === 3 && !line.includes(',,,,,')) {
                accountInfo.accountName = line.replace(/,/g, '').trim();
            }
        }

        return accountInfo;
    }

    /**
     * Parses a single transaction record with English headers
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
            accountNumber: accountNumber,
            description: record.description.trim(),
            bank: {
                id: '058',
                code: '40058',
                name: 'BANREGIO',
            },
            raw: JSON.stringify(record),
        });
    }

    /**
     * Parses currency format with dollar sign and commas
     *
     * @param {string} str
     * @returns {number}
     */
    _parseCurrency(str) {
        if (!str || str.trim() === '' || str === '$0.00' || str === '0.00') return 0;
        const cleanStr = str.replace(/\$/g, '').replace(/,/g, '').trim();
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
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}