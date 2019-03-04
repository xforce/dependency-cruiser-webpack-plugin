const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');
const path = require('path');
const runCruise = require('./checker');

class DependencyCruiserPlugin {
    constructor(options) {
        this.options = options || {};
        this.options.validate = '.dependency-cruiser.js';
        this.compilationDone = false;
    }
    printResults() {
        const pBufferSize = 512;
        const lNumberOfChunks = Math.ceil(this.dependencies.modules.length / pBufferSize);
        let i = 0;
        for (i = 0; i < lNumberOfChunks; i++) {
            process.stdout.write(
                this.dependencies.modules.substr(i * pBufferSize, pBufferSize),
                "utf8"
            );
        }
    }
    apply(compiler) {
        compiler.hooks.beforeCompile.tap('DependencyCruiserPlugin', () => {
            if (this.worker) {
                this.worker.terminate();
            }
            this.worker = new Worker(path.join(__dirname, 'checker.js'), {
                workerData: this.options
            });
            this.worker.on('online', () => {
                this.worker.postMessage('start_checking');
            })
            this.worker.on('message', (data) => {
                if (data.message === 'checking_done') {
                    this.dependencies = data.data;
                    if (this.compilationDone) {
                        this.printResults();
                    }
                }
            });
        });
        compiler.hooks.compile.tap('DependencyCruiserPlugin', (_stats) => {
            this.compilationDone = false;
            this.compilationInProgress = true;
            this.dependencies = null;
        });
        compiler.hooks.done.tap('DependencyCruiserPlugin', () => {
            this.compilationInProgress = false;
            this.compilationDone = true;
            if (this.dependencies) {
                this.printResults();
            }
        });
    }
}
module.exports = DependencyCruiserPlugin;