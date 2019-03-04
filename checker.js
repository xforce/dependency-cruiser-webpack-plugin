process.env.FORCE_COLOR = 1;
const glob = require('glob');
const _get = require('lodash/get');
const parseTSConfig = require('./dependency-cruiser-support/parseTSConfig');
const getResolveConfig = require('./dependency-cruiser-support/getResolveConfig');
const validateFileExistence = require('./dependency-cruiser-support/utl/validateFileExistence');
const normalizeOptions = require('./dependency-cruiser-support/normalizeOptions');
const {
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');

function extractResolveOptions(pOptions) {
    let lResolveOptions = {};
    const lWebPackConfigFileName = _get(pOptions, 'ruleSet.options.webpackConfig.fileName', null);

    if (lWebPackConfigFileName) {
        lResolveOptions = getResolveConfig(
            lWebPackConfigFileName,
            _get(pOptions, 'ruleSet.options.webpackConfig.env', null),
            _get(pOptions, 'ruleSet.options.webpackConfig.arguments', null)
        );
    }
    return lResolveOptions;
}

function extractTSConfigOptions(pOptions) {
    let lRetval = {};
    const lTSConfigFileName = _get(pOptions, "ruleSet.options.tsConfig.fileName", null);

    if (lTSConfigFileName) {
        lRetval = parseTSConfig(lTSConfigFileName);
    }

    return lRetval;
}

function runCruise(pFileDirArray, pOptions) {
    pFileDirArray
        .filter(pFileOrDir => !glob.hasMagic(pFileOrDir))
        .forEach(validateFileExistence);

    pOptions = normalizeOptions(pOptions);

    const main = require('dependency-cruiser');
    const lDependencyList = main.cruise(
        pFileDirArray,
        pOptions,
        extractResolveOptions(pOptions),
        extractTSConfigOptions(pOptions)
    );
    return lDependencyList;
}
module.exports = runCruise;

if (!isMainThread) {
    parentPort.on('message', (data) => {
        if (data === 'start_checking') {
            new Promise((resolve) => {
                const dependencies = runCruise(workerData.directories, workerData.options);
                parentPort.postMessage({
                    message: 'checking_done',
                    data: dependencies
                });
                resolve();
            });
        }
    });
    // parentPort.postMessage({
    //     message: 'initialized'
    // });
}