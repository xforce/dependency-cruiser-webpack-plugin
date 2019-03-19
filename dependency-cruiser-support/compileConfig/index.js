const path = require('path');
const normalizeResolveOptions = require('../resolveOptions/normalize');
const readConfig = require('./readConfig');
const mergeConfigs = require('./mergeConfigs');


/* eslint no-use-before-define: 0 */
function processExtends(pRetval, pAlreadyVisited, pBaseDir) {
    if (typeof pRetval.extends === "string") {
        pRetval = mergeConfigs(
            pRetval,
            compileConfig(pRetval.extends, pAlreadyVisited, pBaseDir)
        );
    }

    if (Array.isArray(pRetval.extends)) {
        pRetval = pRetval.extends.reduce(
            (pAll, pExtends) =>
            mergeConfigs(
                pAll,
                compileConfig(pExtends, pAlreadyVisited, pBaseDir)
            ),
            pRetval
        );
    }
    Reflect.deleteProperty(pRetval, 'extends');
    return pRetval;
}

function compileConfig(pConfigFileName, pAlreadyVisited = new Set(), pBaseDir = process.cwd()) {

    const lResolvedFileName = path.join(pBaseDir, pConfigFileName);
    // const lResolvedFileName = resolve(
    //     pConfigFileName,
    //     pBaseDir,
    //     normalizeResolveOptions({
    //         extensions: [".js", ".json"]
    //     }, {}),
    //     'cli'
    // );
    const lBaseDir = path.dirname(lResolvedFileName);

    if (pAlreadyVisited.has(lResolvedFileName)) {
        throw new Error(`config is circular - ${Array.from(pAlreadyVisited).join(' -> ')} -> ${lResolvedFileName}.\n`);
    }
    pAlreadyVisited.add(lResolvedFileName);

    let lRetval = readConfig(lResolvedFileName, pBaseDir);

    if (lRetval.hasOwnProperty("extends")) {
        lRetval = processExtends(lRetval, pAlreadyVisited, lBaseDir);
    }

    return lRetval;
}

module.exports = compileConfig;