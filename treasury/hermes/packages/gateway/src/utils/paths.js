// ... (existing imports)

/**
 * Get the root path where the Gateway is installed
 * @returns {string} Root directory path
 */
function rootPath() {
    // FIX: Return the correct path instead of process.cwd()
    // This ensures config files are loaded from the right location
    return path.resolve(__dirname, '../../');
}

module.exports = {
    rootPath,
    // ... other exports
};