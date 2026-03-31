# apidocs

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)

> Auto-generate interactive API documentation from Express/Hono/Fastify routes

## Features

- CLI tool
- TypeScript support

## Tech Stack

**Runtime:**
- TypeScript v5.9.3

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

```bash
cd apidocs
npm install
```

Or install globally:

```bash
npm install -g apidocs
```

## Usage

### CLI

```bash
apidocs
```

### Available Scripts

| Script | Command |
|--------|---------|
| `npm run build` | `tsc` |
| `npm run start` | `node dist/index.js` |
| `npm run dev` | `tsc --watch` |

## Project Structure

```
├── public
│   └── index.html
├── src
│   ├── formatter.ts
│   ├── generator.ts
│   ├── index.ts
│   ├── parser.ts
│   ├── scanner.ts
│   └── server.ts
├── package.json
└── tsconfig.json
```

## License

This project is licensed under the **MIT** license.

## Author

**Zakaria Kone**
