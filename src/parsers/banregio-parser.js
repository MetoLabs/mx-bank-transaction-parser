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

        const extractedData = this._extractFromDescription(record.description);

        return new Transaction({
            date,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: (record.reference || '').replace('_', ''),
            accountNumber: accountNumber,
            description: extractedData.actualDescription || record.description.trim(),
            beneficiary: extractedData.establishment || null,
            rfc: extractedData.rfc || null,
            trackingKey: extractedData.trackingKey || null,
            transactionDate: extractedData.transactionDate || null,
            bank: {
                id: '058',
                code: '40058',
                name: 'BANREGIO',
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
            rfc: null,
            transactionDate: null,
            establishment: null,
            actualDescription: description.trim(),
            rawDescription: description
        };

        try {
            const pattern1 = /^([A-Z&Ñ]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A])\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;

            const pattern2 = /^([A-Z]{6}\d{3})\s+SPEI\.\s+([^\.]+)\.\s+([\d\s\.]+)\.\s+([^\.]+)\./;

            const pattern3 = /^\((BE|NB)\)\s+(.+)$/;

            const match1 = description.match(pattern1);
            const match2 = description.match(pattern2);
            const match3 = description.match(pattern3);

            if (match1) {
                result.rfc = match1[1].trim();
                const dateStr = match1[4];
                if (dateStr) {
                    result.transactionDate = this._formatDate(dateStr);
                }
                result.establishment = match1[5].trim();
                result.actualDescription = result.establishment;
            } else if (match2) {
                const speiCode = match2[1];
                const bank = match2[2];
                const account = match2[3];
                const beneficiary = match2[4];

                result.establishment = beneficiary.trim();
                result.actualDescription = `SPEI ${bank} - ${beneficiary}`;

                const trackingMatch = description.match(/(\b[A-Z0-9]{20,30}\b|\b\d{10,20}\b)/);
                if (trackingMatch) {
                    result.trackingKey = trackingMatch[1];
                }
            } else if (match3) {
                const type = match3[1];
                const transferDesc = match3[2];

                const accountMatch = transferDesc.match(/cuenta:\s*(\d+)/i);
                if (accountMatch) {
                    result.accountReference = accountMatch[1];
                }

                const beneficiaryMatch = transferDesc.match(/Transferencia\s+(?:de\s+)?([^\.]+)/i);
                if (beneficiaryMatch) {
                    result.establishment = beneficiaryMatch[1].trim();
                    result.actualDescription = type === 'BE' ? `Traspaso: ${result.establishment}` : `Recepción: ${result.establishment}`;
                } else {
                    result.establishment = transferDesc.trim();
                    result.actualDescription = transferDesc.trim();
                }
            } else {
                const rfcMatch = description.match(/([A-Z&Ñ]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A])/);
                if (rfcMatch) {
                    result.rfc = rfcMatch[1].trim();
                }

                const dateMatch = description.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (dateMatch) {
                    result.transactionDate = this._formatDate(dateMatch[1]);
                }

                if (description.includes('SPEI')) {
                    const beneficiaryMatch = description.match(/SPEI\.\s+[^\.]+\.\s+[\d\s\.]+\.\s+([^\.]+)/);
                    if (beneficiaryMatch) {
                        result.establishment = beneficiaryMatch[1].trim();
                        result.actualDescription = result.establishment;
                    } else {
                        const fallbackMatch = description.match(/\.\s+([^\.\d]+?)(?=\s+\d|$)/);
                        if (fallbackMatch) {
                            result.establishment = fallbackMatch[1].trim();
                            result.actualDescription = result.establishment;
                        }
                    }
                } else {
                    result.establishment = description.trim();
                }
            }

        } catch (error) {
            console.warn('Error extracting data from Banregio description:', error, description);
        }

        return result;
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
        if (!input || typeof input !== 'string') {
            return input;
        }
        const [day, month, year] = input.split('/');
        if (!day || !month || !year) {
            return input;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
}