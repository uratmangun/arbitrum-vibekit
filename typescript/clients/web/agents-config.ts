export const chatAgents = [
  {
    id: 'ember-aave' as const,
    name: 'Lending',
    description: 'AAVE lending agent',
    suggestedActions: [
      {
        title: 'Deposit WETH',
        label: 'to my balance',
        action: 'Deposit WETH to my balance',
      },
      { title: 'Check', label: 'balance', action: 'Check balance' },
    ],
  },
  {
    id: 'ember-camelot' as const,
    name: 'Trading',
    description: 'Camelot Swapping agent',
    suggestedActions: [
      {
        title: 'Swap USDC for ETH',
        label: 'on Arbitrum Network.',
        action: 'Swap USDC for ETH tokens from Arbitrum to Arbitrum.',
      },
      {
        title: 'Buy ARB',
        label: 'on Arbitrum.',
        action: 'Buy ARB token.',
      },
    ],
  },
  {
    id: 'coingecko' as const,
    name: 'Price Charts',
    description: 'Cryptocurrency price data and charts',
    suggestedActions: [
      {
        title: 'Generate BTC',
        label: 'price chart',
        action: 'Generate a price chart for BTC over 7 days',
      },
      {
        title: 'Show supported',
        label: 'tokens',
        action: 'What cryptocurrency tokens are supported?',
      },
      {
        title: 'Generate ETH',
        label: 'price chart',
        action: 'Generate a price chart for ETH over 30 days',
      },
    ],
  },
  {
    id: 'para' as const,
    name: 'Para Wallet',
    description: 'Para wallet agent',
    suggestedActions: [
      {
        title: 'List',
        label: 'pregen wallet',
        action: 'List all pregen wallet',
      },
      {
        title: 'Check',
        label: 'Balance',
        action: 'Check balance of this address in arbitrum-sepolia network',
      },
      {
        title: 'Request faucet',
        label: 'Faucet',
        action: 'Request faucet for this address in ethereum-sepolia network',
      },
    ],
  },
  // {
  //   id: 'langgraph-workflow' as const,
  //   name: 'Greeting Optimizer',
  //   description: 'LangGraph workflow agent that optimizes greetings',
  //   suggestedActions: [
  //     {
  //       title: 'Optimize',
  //       label: 'hello',
  //       action: 'Optimize: hello',
  //     },
  //     {
  //       title: 'Make',
  //       label: 'hi better',
  //       action: 'Make this greeting better: hi',
  //     },
  //     {
  //       title: 'Improve',
  //       label: 'good morning',
  //       action: 'Optimize: good morning',
  //     },
  //   ],
  // },
  // {
  //   id: 'quickstart-agent-template' as const,
  //   name: 'Quickstart',
  //   description: 'Quickstart agent',
  //   suggestedActions: [],
  // },
  // {
  //   id: 'allora-price-prediction-agent' as const,
  //   name: 'Price Prediction',
  //   description: 'Allora price prediction agent',
  //   suggestedActions: [
  //     {
  //       title: 'Get BTC',
  //       label: 'price prediction',
  //       action: 'What is the price prediction for BTC?',
  //     },
  //     {
  //       title: 'Get ETH',
  //       label: 'price prediction',
  //       action: 'What is the price prediction for ETH?',
  //     },
  //     {
  //       title: 'Compare BTC and ETH',
  //       label: 'predictions',
  //       action: 'Get price predictions for both BTC and ETH',
  //     },
  //   ],
  // },
  // {
  //   id: "ember-lp" as const,
  //   name: "LPing",
  //   description: "Camelot Liquidity Provisioning agent",
  //   suggestedActions: [
  //     {
  //       title: "Provide Liquidity",
  //       label: "on Arbitrum.",
  //       action: "Provide Liquidity on Arbitrum.",
  //     },
  //     {
  //       title: "Check",
  //       label: "Liquidity positions",
  //       action: "Check Positions",
  //     },
  //   ],
  // },
  // {
  //   id: "ember-pendle" as const,
  //   name: "Pendle",
  //   description: "Test agent for Pendle",
  //   suggestedActions: [
  //     {
  //       title: "Deposit WETH",
  //       label: "to my balance",
  //       action: "Deposit WETH to my balance",
  //     },
  //     {
  //       title: "Check",
  //       label: "balance",
  //       action: "Check balance",
  //     },
  //   ],
  // },
  {
    id: 'all' as const,
    name: 'All agents',
    description: 'All agents',
    suggestedActions: [
      {
        title: 'What Agents',
        label: 'are available?',
        action: 'What Agents are available?',
      },
      {
        title: 'What can Ember AI',
        label: 'help me with?',
        action: 'What can Ember AI help me with?',
      },
    ],
  },
] as const;

export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
  ['ember-camelot', 'http://swapping-agent-no-wallet:3005/sse'],
  ['coingecko', 'http://coingecko-mcp-server:3011/mcp'], // CoinGecko MCP server
  ['para', 'http://para-mcp-server:3012/mcp'],
  // ['langgraph-workflow', 'http://langgraph-workflow-agent:3009/sse'],
  // ['quickstart-agent-template', 'http://quickstart-agent-template:3007/sse'],
  // ['allora-price-prediction-agent', 'http://allora-price-prediction-agent:3008/sse'],
  // ["ember-lp", "http://liquidity-agent-no-wallet:3002/sse"],
  // ["ember-pendle", "http://pendle-agent:3003/sse"],
]);

export type ChatAgentId = (typeof chatAgents)[number]['id'];
