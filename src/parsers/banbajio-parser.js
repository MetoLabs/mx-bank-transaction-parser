import { Transaction } from '../models/transaction.js';
import * as csv from 'csv-parse/sync';

export class BanBajioParser {
    /**
     * Parses BanBajio CSV content with English headers
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        try {
            const lines = fileContent.split(/\r?\n/).map(line => line.trim());

            const accountInfo = this._extractAccountInfo(lines[0]);
            const accountNumber = accountInfo.accountNumber || '';

            let dataStartIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#,Fecha Movimiento,Hora,Recibo,Descripción,Cargos,Abonos,Saldo')) {
                    dataStartIndex = i + 1;
                    break;
                }
            }

            if (dataStartIndex === -1) {
                console.error('Could not find transaction data in BanBajio file');
                return [];
            }

            const transactionLines = lines.slice(dataStartIndex).filter(line => {
                return line &&
                    line.includes(',') &&
                    !isNaN(parseInt(line.split(',')[0]));
            });

            const transactionData = transactionLines.join('\n');

            const records = csv.parse(transactionData, {
                delimiter: ',',
                columns: ['sequence', 'date', 'time', 'receipt', 'description', 'debit', 'credit', 'balance'],
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                cast: (value, context) => {
                    if (context.column === 'debit' || context.column === 'credit' || context.column === 'balance') {
                        return this._parseNumber(value);
                    }
                    if (context.column === 'sequence') {
                        return parseInt(value) || 0;
                    }
                    return value;
                }
            });

            return records
                .map(record => this.parseRow(record, accountNumber))
                .filter(Boolean);
        } catch (error) {
            console.error('Error parsing BanBajio file:', error);
            return [];
        }
    }

    /**
     * Extracts account information from first line
     *
     * @param {string} firstLine
     * @returns {Object}
     */
    _extractAccountInfo(firstLine) {
        const accountInfo = {
            accountName: '',
            accountNumber: '',
            bank: 'BANBAJIO'
        };

        if (!firstLine) return accountInfo;

        const parts = firstLine.split(',');
        if (parts.length >= 2) {
            accountInfo.accountName = parts[0]?.trim() || '';
            accountInfo.accountNumber = parts[1]?.trim() || '';
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

        // Extract additional data from description
        const extractedData = this._extractFromDescription(record.description);

        // Use extracted reference if available, otherwise fall back to previous method
        const reference = extractedData.reference || this._extractReference(record.description) || '';

        return new Transaction({
            date,
            time: extractedData.time || record.time || null,
            type: credit !== 0 ? 'credit' : 'debit',
            amount,
            balance,
            reference: reference,
            accountNumber: accountNumber,
            description: extractedData.actualDescription || record.description.trim(),
            beneficiary: extractedData.beneficiary || null,
            trackingKey: extractedData.trackingKey || null,
            rfc: extractedData.rfc || null,
            concept: extractedData.concept || null,
            bank: {
                id: '030',
                code: '40030',
                name: 'BAJIO',
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
            time: null,
            beneficiary: null,
            rfc: null,
            concept: null,
            actualDescription: description.trim(),
            rawDescription: description
        };

        try {
            // Extract tracking key
            const trackingMatch = description.match(/Clave de Rastreo:\s*(\S+)/);
            if (trackingMatch) {
                result.trackingKey = trackingMatch[1].trim();
            }

            // Extract reference
            const refMatch = description.match(/Referencia:\s*([^|]+)/);
            if (refMatch) {
                result.reference = refMatch[1].trim();
            }

            // Extract time
            const timeMatch = description.match(/Hora:\s*(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                result.time = timeMatch[1].trim();
            }

            const rfcMatch = description.match(/RFC Ordenante:\s*([A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A])/);
            if (rfcMatch) {
                result.rfc = rfcMatch[1].trim();
            }

            const conceptMatch = description.match(/Concepto del Pago:\s*([^|]+)/);
            if (conceptMatch) {
                result.concept = conceptMatch[1].trim();
            }


            const beneficiaryMatch = description.match(/Ordenante:\s*([^|]+?)\s+Cuenta Ordenante:/);
            if (beneficiaryMatch) {
                result.beneficiary = beneficiaryMatch[1].trim();
            }

            const institutionMatch = description.match(/Institucion contraparte:\s*([^|]+?)\s+Ordenante:/);
            if (institutionMatch) {
                result.counterpartInstitution = institutionMatch[1].trim();
            }

            result.actualDescription = this._buildActualDescription(description, result);

        } catch (error) {
            console.warn('Error extracting data from BanBajio description:', error);
        }

        return result;
    }

    /**
     * Builds a cleaner description from extracted parts
     *
     * @param {string} originalDescription
     * @param {Object} extractedData
     * @returns {string}
     */
    _buildActualDescription(originalDescription, extractedData) {
        if (originalDescription.includes('SPEI Recibido:')) {
            const parts = [];
            if (extractedData.counterpartInstitution) {
                parts.push(extractedData.counterpartInstitution);
            }
            if (extractedData.beneficiary) {
                parts.push(extractedData.beneficiary);
            }
            if (parts.length > 0) {
                return parts.join(' - ');
            }
        }

        const mainDescMatch = originalDescription.match(/Descripción:\s*([^|]+)/);
        if (mainDescMatch) {
            return mainDescMatch[1].trim();
        }

        return originalDescription.trim();
    }

    /**
     * Extracts reference from description (legacy method)
     *
     * @param {string} description
     * @returns {string}
     */
    _extractReference(description) {
        const referenceMatch = description.match(/Referencia:\s*([^|]+)/);
        if (referenceMatch) {
            return referenceMatch[1].trim();
        }

        const trackingMatch = description.match(/Clave de Rastreo:\s*(\S+)/);
        if (trackingMatch) {
            return trackingMatch[1].trim();
        }

        const receiptMatch = description.match(/Recibo #\s*(\d+)/);
        if (receiptMatch) {
            return receiptMatch[1].trim();
        }

        return '';
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
     * Converts DD-MMM-YYYY to YYYY-MM-DD
     *
     * @param {string} input
     * @returns {string}
     */
    _formatDate(input) {
        const months = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };

        const parts = input.split('-');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = months[parts[1]] || '01';
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }

        return input;
    }
}