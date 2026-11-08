# TypeScript Load Balancer

A lightweight Layer 7 HTTP load balancer built with **TypeScript** and **Node.js.** It distributes incoming HTTP requests across multiple backend servers using a Round Robin scheduling algorithm, performs periodic health checks, excludes unhealthy backends, and proxies requests and responses.

## Requirements

- Node.js 22+
- npm

## Installation

```bash
git clone <repository-url>
cd ts-load-balancer
npm install
```

## Running

Start three backend servers in separate terminals:

```bash
npm run backend -- 3000
npm run backend -- 3001
npm run backend -- 3002
```

Start the load balancer:

```bash
npm run dev
```

The load balancer listens on:

```text
http://localhost:8181
```

## Available Endpoints

| Endpoint        | Description                            |
| --------------- | -------------------------------------- |
| `GET /health`   | Load balancer health                   |
| `GET /backends` | Backend server status                  |
| `/*`            | Proxies requests to a selected backend |

## Build

Compile TypeScript:

```bash
npm run build
```

Run the compiled application:

```bash
npm start
```

Run Tests:

```bash
npm test
```

## License

MIT
