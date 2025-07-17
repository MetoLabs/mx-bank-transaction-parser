export class BaseParser {
    /**
     * @param {string|ArrayBuffer} fileContent - The raw content of the file.
     * @returns {Transaction[]}
     */
    parse(fileContent) {
        throw new Error('Parse method not implemented.');
    }
}
