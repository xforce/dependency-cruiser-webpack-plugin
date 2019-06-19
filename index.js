const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');
const path = require('path');
const runCruise = require('./checker');
const chalk = require('chalk');
const os = require('os');

class DependencyCruiserPlugin {
    constructor(options) {
        this.options = options || {};
        this.options.validate = '.dependency-cruiser.js';
        this.compilationDone = false;
        this.dependency_check = null;
        this.error_found = false;
        this.restartOnExit = false;
    }
    reportErrors(compilation) {
        const colors = new chalk.constructor({});
        const formatMessage = violation => {
            const messageColor =
                violation.rule.severity === 'warn' ?
                colors.bold.yellow :
                colors.bold.red;
            const fileColor = colors.bold.cyan;
            const codeColor = colors.grey;

            return [
                fileColor(violation.from) + messageColor(':'),
                codeColor(violation.rule.name + ': ') + '→ ' + violation.to
            ].join(os.EOL);
        };
        this.dependencies.summary.violations.forEach(violation => {
            if (violation.to === '✖') {
                return;
            }
            const formatted = {
                name: 'DependencyViolation',
                message: formatMessage(violation, true)
            };
            if (violation.rule.severity === 'error') {
                if (compilation) {
                    compilation.errors.push(formatted);
                }
                this.error_found = true;
            } else if (violation.rule.severity === 'warn') {
                if (compilation) {
                    compilation.warnings.push(formatted);
                }
                this.error_found = true;
            }
        });
    }
    startWorker() {
        this.worker = new Worker(path.join(__dirname, 'checker.js'), {
            workerData: this.options
        });
        this.worker.on('online', () => {
            this.worker.postMessage('start_checking');
        });
        this.worker.on('exit', () => {
            this.worker = null;
            this.dependency_check = null;
            if (this.restartOnExit) {
                this.restartOnExit = false;
                return new Promise(() => {
                    this.startWorker();
                });
            }
        });
        this.worker.on('error', () => {
            this.worker = null;
            this.dependency_check = null;
        });
        this.dependency_check = new Promise(resolve => {
            if (this.worker) {
                this.worker.on('message', data => {
                    if (data.message === 'checking_done') {
                        this.dependencies = data.data;
                        resolve();
                    }
                });    
            } else {
                console.error('Worker died before dependency check has started');
            }
        });
    }
    apply(compiler) {
        compiler.hooks.thisCompilation.tap('DependencyCruiserPlugin', () => {
            if (this.worker) {
                this.restartOnExit = true;
                this.worker.postMessage('close');
                return;
            }
            this.startWorker();
        });
        compiler.hooks.compile.tap('DependencyCruiserPlugin', compilation => {
            this.compilationDone = false;
            this.compilationInProgress = true;
            this.dependencies = null;
            this.error_found = false;
        });
        compiler.hooks.make.tapPromise('DependencyCruiserPlugin', compilation => {
            return new Promise(resolve => {
                if (this.options.fail_compile) {
                    if (this.dependencies || !this.dependency_check) {
                        this.reportErrors(compilation);
                        resolve();
                    } else {
                        this.dependency_check.then(() => {
                            this.reportErrors(compilation);
                            resolve();
                        });
                    }
                } else {
                    resolve();
                }
            });
        });
        compiler.hooks.done.tap('DependencyCruiserPlugin', _stats => {
            this.compilationInProgress = false;
            this.compilationDone = true;
            if (this.worker) {
                this.worker.postMessage('close');
            }
            const colors = new chalk.constructor({});
            if (this.options.fail_compile) {
                if (!this.error_found) {
                    console.info(colors.green('No dependency errors found'));
                }
            } else {
                if (this.dependencies || !this.dependency_check) {
                    this.reportErrors();
                    if (!this.error_found) {
                        console.info(colors.green('No dependency errors found'));
                    }
                } else {
                    this.dependency_check.then(() => {
                        this.reportErrors();
                        if (!this.error_found) {
                            console.info(colors.green('No dependency errors found'));
                        }
                    });
                }
            }
        });
    }
}
module.exports = DependencyCruiserPlugin;
