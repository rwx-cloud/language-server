const { spawn } = require("child_process");

const server = spawn("node", ["dist/server.js", "--stdio"]);
let response = "";

server.stdout.on("data", (data) => {
  response += data.toString();
  if (response.includes('"result"')) {
    console.log("Got LSP response");
    server.kill();
  }
});

server.on("close", () => {
  if (response.includes('"jsonrpc":"2.0"') && response.includes('"result"')) {
    console.log("Bundle test passed: server responds to LSP initialize");
    process.exit(0);
  } else {
    console.error("Unexpected response:", response);
    process.exit(1);
  }
});

const body = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null },
});
const message = "Content-Length: " + Buffer.byteLength(body) + "\r\n\r\n" + body;
server.stdin.write(message);

setTimeout(() => {
  console.error("Timeout waiting for response");
  server.kill();
  process.exit(1);
}, 5000);
