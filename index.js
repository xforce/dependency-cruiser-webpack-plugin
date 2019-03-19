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
    }
    reportErrors(compilation) {
        const formatMessage = (violation, useColors) => {
            const colors = new chalk.constructor({
                enabled: useColors
            });
            const messageColor = violation.rule.severity === 'warn' ?
                colors.bold.yellow :
                colors.bold.red;
            const fileAndNumberColor = colors.bold.cyan;
            const codeColor = colors.grey;

            return [
                fileAndNumberColor(violation.from) +
                messageColor(':'),
                codeColor(violation.rule.name + ': ') + '→ ' + violation.to
            ].join(os.EOL);
        };
        this.dependencies.summary.violations.forEach(violation => {
            const formatted = {
                name: 'DependencyViolation',
                message: formatMessage(violation, true),
            };
            if (violation.rule.severity === 'error') {
                compilation.errors.push(formatted);
            } else if (violation.rule.severity === 'warn') {
                compilation.warnings.push(formatted);
            }
        });
    }
    apply(compiler) {
        compiler.hooks.beforeCompile.tap('DependencyCruiserPlugin', () => {
            if (this.worker) {
                this.worker.postMessage('close');
            }
            this.worker = new Worker(path.join(__dirname, 'checker.js'), {
                workerData: this.options
            });
            this.worker.on('online', () => {
                this.worker.postMessage('start_checking');
            })
            this.dependency_check = new Promise((resolve) => {
                this.worker.on('message', (data) => {
                    if (data.message === 'checking_done') {
                        this.dependencies = data.data;
                        resolve();
                    }
                });
            });
        });
        compiler.hooks.compile.tap('DependencyCruiserPlugin', (compilation) => {
            this.compilationDone = false;
            this.compilationInProgress = true;
            this.dependencies = null;
        });
        compiler.hooks.make.tapPromise('DependencyCruiserPlugin', (compilation) => {
            return new Promise((resolve) => {
                if (this.dependencies ||
                    !this.dependency_check) {
                    this.reportErrors(compilation);
                    resolve();
                } else {
                    this.dependency_check.then(() => {
                        this.reportErrors(compilation);
                        resolve();
                    });
                }
            });
        });
        compiler.hooks.done.tap('DependencyCruiserPlugin', (_stats) => {
            this.compilationInProgress = false;
            this.compilationDone = true;
            if (this.worker) {
                this.worker.postMessage('close');
            }
        });
    }
}
module.exports = DependencyCruiserPlugin;