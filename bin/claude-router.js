#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { summary } = require('../src/stats');
const { classify } = require('../src/classifier');
const chalk = require('chalk');
const { spawn, execSync } = require('child_process');
const path = require('path');

program
  .name('claude-router')
  .description('ModelRouter — intelligent AI routing proxy for Claude Code')
  .version('0.1.0');

program.command('start')
  .description('Start the router daemon')
  .action(() => {
    console.log(chalk.green('[claude-router] Starting router on port 8082...'));
    console.log(chalk.yellow('Set this env var before running claude:'));
    console.log(chalk.cyan('  export ANTHROPIC_BASE_URL=http://127.0.0.1:8082'));
    const child = spawn('node', [path.join(__dirname, '..', 'src', 'router-service.js')], {
      detached: true,
      stdio: 'inherit',
    });
    child.unref();
  });

program.command('stop')
  .description('Stop the router daemon')
  .action(() => {
    try {
      execSync('pkill -f router-service.js', { stdio: 'ignore' });
      console.log(chalk.green('[claude-router] Stopped.'));
    } catch {
      console.log(chalk.yellow('[claude-router] No running router found.'));
    }
  });

program.command('stats')
  .description('Show routing statistics')
  .option('--today', 'Show only today\'s stats')
  .option('--week', 'Show last 7 days')
  .action((opts) => {
    const ms = opts.today ? 86400000 : opts.week ? 604800000 : 0;
    const { total, byTarget } = summary(ms);
    const period = opts.today ? 'Today' : opts.week ? 'Last 7 days' : 'All time';
    console.log(chalk.bold(`\n${period}: ${total} total requests\n`));
    for (const [target, count] of Object.entries(byTarget)) {
      const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
      const bar = '█'.repeat(Math.round(count / Math.max(...Object.values(byTarget)) * 20));
      console.log(`  ${chalk.cyan(target.padEnd(16))} ${String(count).padStart(4)} requests  ${pct.padStart(5)}%  ${chalk.green(bar)}`);
    }
    const claudeCount = byTarget['claude'] || 0;
    const savings = total ? (((total - claudeCount) / total) * 100).toFixed(0) : 0;
    console.log(chalk.bold(`\n  Claude savings: ${savings}% of requests routed away ✓\n`));
  });

program.command('test <prompt>')
  .description('Test routing without executing — shows which model would be used')
  .action((prompt) => {
    const { target, rule } = classify(prompt);
    console.log(chalk.bold('\nRouting decision:'));
    console.log(`  Prompt:  ${chalk.gray(prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''))}`);
    console.log(`  Rule:    ${chalk.yellow(rule)}`);
    console.log(`  Target:  ${chalk.cyan(target)}\n`);
  });

program.command('logs')
  .description('View router logs')
  .option('--tail', 'Follow logs in real time')
  .action((opts) => {
    const logFile = require('path').join(require('os').homedir(), '.claude-router', 'router.log');
    if (opts.tail) {
      spawn('tail', ['-f', logFile], { stdio: 'inherit' });
    } else {
      try {
        const { execSync } = require('child_process');
        execSync(`tail -100 ${logFile}`, { stdio: 'inherit' });
      } catch {
        console.log(chalk.yellow('No log file found yet. Start the router first.'));
      }
    }
  });

program.parse(process.argv);
