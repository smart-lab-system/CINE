import { writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api-docs-json';

const ast = await openapiTS(new URL(API_URL));
const contents = astToString(ast);

await writeFile(
  new URL('../src/api/schema.d.ts', import.meta.url),
  contents,
);

console.log('Wrote packages/shared/src/api/schema.d.ts');
