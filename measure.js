#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');

const options = {
  url:         { type: 'string',  default: 'http://localhost:3000' },
  runs:        { type: 'string',  default: '3' },
  interactive: { type: 'boolean', default: false },
  lighthouse:  { type: 'boolean', default: false },
  timeout:     { type: 'string',  default: '30000' },
  quick:       { type: 'boolean', default: false },
};

const { values } = parseArgs({ options, allowPositionals: false });

const config = {
  url:         values.url,
  runs:        values.quick ? 1 : parseInt(values.runs, 10),
  interactive: values.interactive,
  lighthouse:  values.lighthouse,
  timeout:     parseInt(values.timeout, 10),
};

async function main(config) {
  // 다음 Task에서 구현
  console.log(JSON.stringify({ status: 'not-implemented', config }));
}

main(config).catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
