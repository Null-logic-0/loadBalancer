import http from "node:http";

const port = Number(process.argv[2] ?? 3000);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        status: "healthy",
        port,
      }),
    );

    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });

  res.end(`Hello from backend server running on port ${port}`);
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
