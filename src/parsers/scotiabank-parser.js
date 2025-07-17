import { Transaction } from '../models/transaction.js';

export class ScotiabankParser {
    /**
     * Parses a Scotiabank TXT file content into a list of transactions.
     *
     * @param {string} fileContent
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        const lines = fileContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 100);

        const transactions = [];

        for (const line of lines) {
            const accountType = line.substring(0, 3);
            const currency = line.substring(3, 6);
            const rawAccountNumber = line.substring(6, 26);
            const accountNumber = rawAccountNumber.replace(/^0+/, ''); // Strip leading zeros
            const date = line.substring(28, 36);

            transactions.push(new Transaction({
                date,
                type: accountType,
                currency,
                reference: null,
                accountNumber,
                description: '',
                amount: 0,
                balance: 0,
                bank: 'Scotiabank',
                trackingKey: '',
                beneficiary: '',
                extra: line,
            }));
        }

        return transactions;
    }
}
