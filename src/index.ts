#!/usr/bin/env node

/**
 * cBioPortal Navigator Entry Point
 */

import { CbioportalNavigator } from './server.js';

async function main() {
    const server = new CbioportalNavigator();
    await server.run();
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
