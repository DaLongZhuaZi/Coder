'use strict';

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const pagePath = path.join(workspaceRoot, 'entry', 'src', 'main', 'ets', 'pages', 'ngf', 'NGFAgentHomePage.ets');
const modelsPath = path.join(workspaceRoot, 'entry', 'src', 'main', 'ets', 'features', 'agentBridge', 'AgentBridgeModels.ets');
const page = fs.readFileSync(pagePath, 'utf8');
const models = fs.readFileSync(modelsPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(page.includes("@State private usageBudgetCurrencyDraft: string = '';"),
  'App budget currency draft must start unavailable, not USD.');
assert(page.includes('this.usageBudgetCurrencyDraft = this.usageBudget.currency;'),
  'Budget response must preserve an unavailable currency as an empty value.');
assert(!page.includes("this.usageBudget.currency.length > 0 ? this.usageBudget.currency : 'USD'"),
  'App must not synthesize USD when the Bridge omits currency.');
assert(models.includes('currency: string = \'\';'),
  'Budget model must retain an empty currency as the unavailable default.');
assert(page.includes("if (costLimit >= 0 && currency.length === 0)"),
  'Cost budgets must still require an explicit currency.');

console.log('App usage budget currency smoke passed.');
